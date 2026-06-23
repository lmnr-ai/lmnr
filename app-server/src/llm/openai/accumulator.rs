#![cfg_attr(not(feature = "signals"), allow(dead_code))]

use serde_json::Value;
use tokio::sync::mpsc::UnboundedSender;

use crate::llm::models::{
    ProviderCandidate, ProviderContent, ProviderFinishReason, ProviderFunctionCall, ProviderPart,
    ProviderResponse, ProviderStreamChunk, ProviderUsageMetadata,
};
use crate::llm::sse::StreamAccumulator;

#[derive(Default)]
pub(super) struct OpenAIStreamAccumulator {
    reasoning: String,
    text: String,
    tool_calls: Vec<(Option<String>, String, String)>,
    finish_reason: Option<ProviderFinishReason>,
    usage: Option<ProviderUsageMetadata>,
}

impl StreamAccumulator for OpenAIStreamAccumulator {
    type Chunk = Value;

    fn ingest(&mut self, chunk: Value, tx: &UnboundedSender<ProviderStreamChunk>) {
        if let Some(usage) = chunk.get("usage").filter(|u| !u.is_null()) {
            self.usage = Some(super::conversions::parse_usage(usage));
        }

        let Some(choice) = chunk
            .get("choices")
            .and_then(|c| c.as_array())
            .and_then(|c| c.first())
        else {
            return;
        };

        if let Some(fr) = choice.get("finish_reason").and_then(|f| f.as_str()) {
            self.finish_reason = Some(super::conversions::map_finish_reason(fr));
        }

        let Some(delta) = choice.get("delta") else {
            return;
        };

        // OpenAI-compatible proxies stream reasoning under `reasoning_content` (DeepSeek/vLLM) or
        // `reasoning` (OpenRouter); the official OpenAI API exposes none here.
        if let Some(reasoning) = delta
            .get("reasoning_content")
            .or_else(|| delta.get("reasoning"))
            .and_then(|r| r.as_str())
        {
            if !reasoning.is_empty() {
                self.reasoning.push_str(reasoning);
                let _ = tx.send(ProviderStreamChunk::Thought(reasoning.to_string()));
            }
        }

        if let Some(text) = delta.get("content").and_then(|c| c.as_str()) {
            if !text.is_empty() {
                self.text.push_str(text);
                let _ = tx.send(ProviderStreamChunk::Text(text.to_string()));
            }
        }

        if let Some(tool_calls) = delta.get("tool_calls").and_then(|t| t.as_array()) {
            for tc in tool_calls {
                let index = tc.get("index").and_then(|i| i.as_u64()).unwrap_or(0) as usize;
                while self.tool_calls.len() <= index {
                    self.tool_calls.push((None, String::new(), String::new()));
                }
                let entry = &mut self.tool_calls[index];
                if let Some(id) = tc.get("id").and_then(|v| v.as_str()) {
                    if !id.is_empty() {
                        entry.0 = Some(id.to_string());
                    }
                }
                if let Some(func) = tc.get("function") {
                    if let Some(name) = func.get("name").and_then(|n| n.as_str()) {
                        if !name.is_empty() {
                            entry.1 = name.to_string();
                        }
                    }
                    if let Some(args) = func.get("arguments").and_then(|a| a.as_str()) {
                        entry.2.push_str(args);
                    }
                }
            }
        }
    }

    fn into_response(self, model: &str) -> ProviderResponse {
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
        for (id, name, args_buf) in self.tool_calls {
            // Skip padded slots that never received a tool name — they'd dispatch as `Unknown tool`.
            if name.is_empty() {
                continue;
            }
            let args = if args_buf.trim().is_empty() {
                None
            } else {
                serde_json::from_str::<Value>(&args_buf).ok()
            };
            parts.push(ProviderPart {
                function_call: Some(ProviderFunctionCall { id, name, args }),
                ..Default::default()
            });
        }

        ProviderResponse {
            candidates: Some(vec![ProviderCandidate {
                content: Some(ProviderContent {
                    role: Some("model".to_string()),
                    parts: Some(parts),
                }),
                finish_reason: self.finish_reason,
            }]),
            usage_metadata: self.usage,
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
    async fn crlf_framed_chunks_are_split_and_text_forwarded_incrementally() {
        let body = concat!(
            "data: {\"choices\":[{\"delta\":{\"content\":\"Hel\"}}]}\r\n\r\n",
            "data: {\"choices\":[{\"delta\":{\"content\":\"lo\"}}]}\r\n\r\n",
            "data: [DONE]\r\n\r\n",
        );
        let (head, tail) = body.split_at(40);
        let byte_stream = stream::iter(vec![
            Ok::<_, reqwest::Error>(Bytes::copy_from_slice(head.as_bytes())),
            Ok::<_, reqwest::Error>(Bytes::copy_from_slice(tail.as_bytes())),
        ]);

        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<ProviderStreamChunk>();
        let response =
            accumulate_sse::<OpenAIStreamAccumulator, OpenAIError>(byte_stream, "model", &tx)
                .await
                .unwrap();
        drop(tx);

        let mut forwarded = Vec::new();
        while let Ok(chunk) = rx.try_recv() {
            if let ProviderStreamChunk::Text(t) = chunk {
                forwarded.push(t);
            }
        }
        assert_eq!(
            forwarded,
            vec!["Hel".to_string(), "lo".to_string()],
            "CRLF-framed text deltas must be forwarded incrementally, not held until end-of-stream"
        );
        let text = response.candidates.unwrap()[0]
            .content
            .as_ref()
            .unwrap()
            .parts
            .as_ref()
            .unwrap()
            .iter()
            .find_map(|p| p.text.clone())
            .unwrap();
        assert_eq!(text, "Hello");
    }

    #[tokio::test]
    async fn reasoning_deltas_are_captured_as_thought() {
        let body = concat!(
            "data: {\"choices\":[{\"delta\":{\"reasoning_content\":\"thinking\"}}]}\n\n",
            "data: {\"choices\":[{\"delta\":{\"content\":\"answer\"}}]}\n\n",
            "data: [DONE]\n\n",
        );
        let byte_stream = stream::iter(vec![Ok::<_, reqwest::Error>(Bytes::copy_from_slice(
            body.as_bytes(),
        ))]);

        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<ProviderStreamChunk>();
        let response =
            accumulate_sse::<OpenAIStreamAccumulator, OpenAIError>(byte_stream, "model", &tx)
                .await
                .unwrap();
        drop(tx);

        let mut thoughts = Vec::new();
        while let Ok(chunk) = rx.try_recv() {
            if let ProviderStreamChunk::Thought(t) = chunk {
                thoughts.push(t);
            }
        }
        assert_eq!(thoughts, vec!["thinking".to_string()]);

        let parts = response.candidates.unwrap()[0]
            .content
            .as_ref()
            .unwrap()
            .parts
            .clone()
            .unwrap();
        assert!(
            parts
                .iter()
                .any(|p| p.thought == Some(true) && p.text.as_deref() == Some("thinking"))
        );
    }
}
