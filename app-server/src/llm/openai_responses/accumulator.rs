#![cfg_attr(not(feature = "signals"), allow(dead_code))]

use serde_json::Value;
use tokio::sync::mpsc::UnboundedSender;

use super::conversions::parse_openai_responses_response;
use crate::llm::models::{
    ProviderCandidate, ProviderContent, ProviderPart, ProviderResponse, ProviderStreamChunk,
};
use crate::llm::sse::StreamAccumulator;

/// Accumulator for the Responses API SSE stream. Deltas are forwarded live for
/// UX; the terminal `response.completed`/`incomplete`/`failed` event carries the
/// full `response` object which is parsed for the authoritative final result
/// (output items + usage, including reasoning tokens).
#[derive(Default)]
pub(super) struct OpenAIResponsesStreamAccumulator {
    reasoning: String,
    text: String,
    final_response: Option<Value>,
}

impl StreamAccumulator for OpenAIResponsesStreamAccumulator {
    type Chunk = Value;

    fn ingest(&mut self, chunk: Value, tx: &UnboundedSender<ProviderStreamChunk>) {
        let Some(event_type) = chunk.get("type").and_then(|t| t.as_str()) else {
            return;
        };
        match event_type {
            "response.output_text.delta" => {
                if let Some(delta) = chunk.get("delta").and_then(|d| d.as_str()) {
                    if !delta.is_empty() {
                        self.text.push_str(delta);
                        let _ = tx.send(ProviderStreamChunk::Text(delta.to_string()));
                    }
                }
            }
            "response.reasoning_summary_text.delta" | "response.reasoning_text.delta" => {
                if let Some(delta) = chunk.get("delta").and_then(|d| d.as_str()) {
                    if !delta.is_empty() {
                        self.reasoning.push_str(delta);
                        let _ = tx.send(ProviderStreamChunk::Thought(delta.to_string()));
                    }
                }
            }
            "response.completed" | "response.incomplete" | "response.failed" => {
                if let Some(response) = chunk.get("response") {
                    self.final_response = Some(response.clone());
                }
            }
            _ => {}
        }
    }

    fn into_response(self, model: &str) -> ProviderResponse {
        // Prefer the authoritative full response object from the terminal event.
        if let Some(response) = self.final_response {
            if let Ok(parsed) = parse_openai_responses_response(response) {
                return parsed;
            }
        }

        // Fallback: assemble from accumulated deltas (no tool calls / usage).
        let mut parts: Vec<ProviderPart> = Vec::new();
        if !self.reasoning.is_empty() {
            parts.push(ProviderPart {
                text: Some(self.reasoning),
                thought: Some(true),
                ..Default::default()
            });
        }
        if !self.text.is_empty() {
            parts.push(ProviderPart {
                text: Some(self.text),
                ..Default::default()
            });
        }
        ProviderResponse {
            candidates: Some(vec![ProviderCandidate {
                content: Some(ProviderContent {
                    role: Some("model".to_string()),
                    parts: Some(parts),
                }),
                finish_reason: None,
            }]),
            usage_metadata: None,
            model_version: Some(model.to_string()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::llm::openai::OpenAIError;
    use crate::llm::sse::accumulate_sse;
    use bytes::Bytes;
    use futures_util::stream;

    #[tokio::test]
    async fn responses_stream_forwards_deltas_and_parses_terminal_event() {
        let body = concat!(
            "data: {\"type\":\"response.reasoning_summary_text.delta\",\"delta\":\"think\"}\n\n",
            "data: {\"type\":\"response.output_text.delta\",\"delta\":\"Hel\"}\n\n",
            "data: {\"type\":\"response.output_text.delta\",\"delta\":\"lo\"}\n\n",
            "data: {\"type\":\"response.completed\",\"response\":{\"model\":\"gpt-5\",\"status\":\"completed\",\"output\":[{\"type\":\"message\",\"role\":\"assistant\",\"content\":[{\"type\":\"output_text\",\"text\":\"Hello\"}]}],\"usage\":{\"input_tokens\":3,\"output_tokens\":7,\"output_tokens_details\":{\"reasoning_tokens\":4},\"total_tokens\":10}}}\n\n",
            "data: [DONE]\n\n",
        );
        let byte_stream = stream::iter(vec![Ok::<_, reqwest::Error>(Bytes::copy_from_slice(
            body.as_bytes(),
        ))]);

        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<ProviderStreamChunk>();
        let response =
            accumulate_sse::<OpenAIResponsesStreamAccumulator, OpenAIError>(byte_stream, "gpt-5", &tx)
                .await
                .unwrap();
        drop(tx);

        let mut texts = Vec::new();
        let mut thoughts = Vec::new();
        while let Ok(chunk) = rx.try_recv() {
            match chunk {
                ProviderStreamChunk::Text(t) => texts.push(t),
                ProviderStreamChunk::Thought(t) => thoughts.push(t),
            }
        }
        assert_eq!(texts, vec!["Hel".to_string(), "lo".to_string()]);
        assert_eq!(thoughts, vec!["think".to_string()]);

        // Final result comes from the authoritative terminal event.
        let parts = response.candidates.unwrap()[0]
            .content
            .as_ref()
            .unwrap()
            .parts
            .clone()
            .unwrap();
        assert!(parts.iter().any(|p| p.text.as_deref() == Some("Hello")));
        let usage = response.usage_metadata.unwrap();
        assert_eq!(usage.candidates_token_count, Some(7));
        assert_eq!(usage.reasoning_token_count, Some(4));
    }
}
