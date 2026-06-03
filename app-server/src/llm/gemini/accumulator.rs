#![cfg_attr(not(feature = "signals"), allow(dead_code))]

use tokio::sync::mpsc::UnboundedSender;

use super::{Candidate, Content, FinishReason, GenerateContentResponse, Part, UsageMetadata};
use crate::llm::models::{ProviderResponse, ProviderStreamChunk};
use crate::llm::sse::StreamAccumulator;

#[derive(Default)]
pub(super) struct GeminiStreamAccumulator {
    parts: Vec<Part>,
    finish_reason: Option<FinishReason>,
    usage_metadata: Option<UsageMetadata>,
    model_version: Option<String>,
    response_id: Option<String>,
    role: Option<String>,
}

impl GeminiStreamAccumulator {
    // Concatenate consecutive plain-text deltas that share the same thought flag.
    fn merge_part(&mut self, part: Part) {
        if part.function_call.is_none() && part.text.is_some() {
            if let Some(last) = self.parts.last_mut() {
                if last.function_call.is_none()
                    && last.text.is_some()
                    && last.thought == part.thought
                {
                    last.text
                        .get_or_insert_with(String::new)
                        .push_str(part.text.as_deref().unwrap_or_default());
                    if part.thought_signature.is_some() {
                        last.thought_signature = part.thought_signature;
                    }
                    return;
                }
            }
        }
        self.parts.push(part);
    }
}

impl StreamAccumulator for GeminiStreamAccumulator {
    type Chunk = GenerateContentResponse;

    fn ingest(
        &mut self,
        chunk: GenerateContentResponse,
        tx: &UnboundedSender<ProviderStreamChunk>,
    ) {
        if chunk.usage_metadata.is_some() {
            self.usage_metadata = chunk.usage_metadata;
        }
        if chunk.model_version.is_some() {
            self.model_version = chunk.model_version;
        }
        if chunk.response_id.is_some() {
            self.response_id = chunk.response_id;
        }

        let Some(candidate) = chunk.candidates.and_then(|c| c.into_iter().next()) else {
            return;
        };
        if candidate.finish_reason.is_some() {
            self.finish_reason = candidate.finish_reason;
        }
        let Some(content) = candidate.content else {
            return;
        };
        if content.role.is_some() {
            self.role = content.role;
        }
        let Some(parts) = content.parts else {
            return;
        };
        for part in parts {
            if let Some(text) = part.text.as_ref().filter(|t| !t.is_empty()) {
                let stream_chunk = if part.thought == Some(true) {
                    ProviderStreamChunk::Thought(text.clone())
                } else {
                    ProviderStreamChunk::Text(text.clone())
                };
                let _ = tx.send(stream_chunk);
            }
            self.merge_part(part);
        }
    }

    fn into_response(self, _model: &str) -> ProviderResponse {
        let candidate = Candidate {
            content: Some(Content {
                role: self.role.or_else(|| Some("model".to_string())),
                parts: (!self.parts.is_empty()).then_some(self.parts),
            }),
            finish_reason: self.finish_reason,
            finish_message: None,
            safety_ratings: None,
            index: None,
        };
        GenerateContentResponse {
            candidates: Some(vec![candidate]),
            usage_metadata: self.usage_metadata,
            model_version: self.model_version,
            response_id: self.response_id,
        }
        .into()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::llm::gemini::GeminiError;
    use crate::llm::sse::accumulate_sse;
    use bytes::Bytes;
    use futures_util::stream;

    const CRLF_BODY: &str = concat!(
        "data: {\"candidates\":[{\"content\":{\"parts\":[{\"functionCall\":{\"name\":\"compress_trace\",\"args\":{\"x\":1},\"id\":\"abc\"},\"thoughtSignature\":\"sig\"}],\"role\":\"model\"},\"index\":0}],\"modelVersion\":\"gemini-3-flash-preview\"}\r\n\r\n",
        "data: {\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"\"}],\"role\":\"model\"},\"finishReason\":\"STOP\",\"index\":0}]}\r\n\r\n",
    );

    async fn assemble(chunks: Vec<&str>) -> (ProviderResponse, Vec<ProviderStreamChunk>) {
        let byte_stream = stream::iter(
            chunks
                .into_iter()
                .map(|c| Ok::<_, reqwest::Error>(Bytes::copy_from_slice(c.as_bytes())))
                .collect::<Vec<_>>(),
        );
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<ProviderStreamChunk>();
        let response =
            accumulate_sse::<GeminiStreamAccumulator, GeminiError>(byte_stream, "model", &tx)
                .await
                .unwrap();
        drop(tx);
        let mut forwarded = Vec::new();
        while let Ok(c) = rx.try_recv() {
            forwarded.push(c);
        }
        (response, forwarded)
    }

    #[tokio::test]
    async fn crlf_stream_split_across_chunks_assembles_function_call() {
        let (head, tail) = CRLF_BODY.split_at(40);
        let (response, _) = assemble(vec![head, tail]).await;
        let parts = response
            .candidates
            .unwrap()
            .into_iter()
            .next()
            .unwrap()
            .content
            .unwrap()
            .parts
            .unwrap();
        assert!(
            parts.iter().any(|p| p
                .function_call
                .as_ref()
                .is_some_and(|f| f.name == "compress_trace")),
            "compress_trace function call must survive CRLF framing reassembly"
        );
    }

    #[tokio::test]
    async fn text_deltas_are_forwarded_incrementally() {
        let body = concat!(
            "data: {\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"Hel\"}],\"role\":\"model\"}}]}\n\n",
            "data: {\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"lo\"}],\"role\":\"model\"}}]}\n\n",
        );
        let (_, forwarded) = assemble(vec![body]).await;
        let texts: Vec<String> = forwarded
            .into_iter()
            .filter_map(|c| match c {
                ProviderStreamChunk::Text(t) => Some(t),
                _ => None,
            })
            .collect();
        assert_eq!(texts, vec!["Hel".to_string(), "lo".to_string()]);
    }
}
