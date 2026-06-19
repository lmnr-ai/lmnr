#![cfg_attr(not(feature = "signals"), allow(dead_code))]

use serde_json::Value;
use tokio::sync::mpsc::UnboundedSender;

use super::{map_stop_reason, parse_usage};
use crate::llm::models::{
    ProviderCandidate, ProviderContent, ProviderFunctionCall, ProviderPart, ProviderResponse,
    ProviderStreamChunk,
};

#[derive(Default)]
pub(super) struct BedrockStreamAccumulator {
    blocks: Vec<BedrockBlock>,
    stop_reason: Option<String>,
    usage: Option<Value>,
}

enum BedrockBlock {
    Text {
        text: String,
    },
    Thinking {
        text: String,
        signature: Option<String>,
    },
    ToolUse {
        id: Option<String>,
        name: String,
        input_json: String,
    },
}

impl BedrockStreamAccumulator {
    pub(super) fn ingest(
        &mut self,
        value: &Value,
        chunk_tx: &UnboundedSender<ProviderStreamChunk>,
    ) {
        let event_type = value.get("type").and_then(|t| t.as_str()).unwrap_or("");
        match event_type {
            "message_start" => {
                if let Some(usage) = value
                    .get("message")
                    .and_then(|m| m.get("usage"))
                    .filter(|u| !u.is_null())
                {
                    self.merge_usage(usage);
                }
            }
            "content_block_start" => {
                let index = value.get("index").and_then(|i| i.as_u64()).unwrap_or(0) as usize;
                let block = value.get("content_block");
                let block_type = block
                    .and_then(|b| b.get("type"))
                    .and_then(|t| t.as_str())
                    .unwrap_or("");
                let new_block = match block_type {
                    "thinking" => BedrockBlock::Thinking {
                        text: block
                            .and_then(|b| b.get("thinking"))
                            .and_then(|t| t.as_str())
                            .unwrap_or("")
                            .to_string(),
                        signature: block
                            .and_then(|b| b.get("signature"))
                            .and_then(|s| s.as_str())
                            .map(|s| s.to_string()),
                    },
                    "tool_use" => BedrockBlock::ToolUse {
                        id: block
                            .and_then(|b| b.get("id"))
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string()),
                        name: block
                            .and_then(|b| b.get("name"))
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string(),
                        input_json: String::new(),
                    },
                    _ => BedrockBlock::Text {
                        text: block
                            .and_then(|b| b.get("text"))
                            .and_then(|t| t.as_str())
                            .unwrap_or("")
                            .to_string(),
                    },
                };
                while self.blocks.len() <= index {
                    self.blocks.push(BedrockBlock::Text {
                        text: String::new(),
                    });
                }
                self.blocks[index] = new_block;
            }
            "content_block_delta" => {
                let index = value.get("index").and_then(|i| i.as_u64()).unwrap_or(0) as usize;
                let delta = value.get("delta");
                let delta_type = delta
                    .and_then(|d| d.get("type"))
                    .and_then(|t| t.as_str())
                    .unwrap_or("");
                let Some(block) = self.blocks.get_mut(index) else {
                    return;
                };
                match (delta_type, block) {
                    ("text_delta", BedrockBlock::Text { text }) => {
                        if let Some(t) = delta.and_then(|d| d.get("text")).and_then(|t| t.as_str())
                        {
                            text.push_str(t);
                            let _ = chunk_tx.send(ProviderStreamChunk::Text(t.to_string()));
                        }
                    }
                    ("thinking_delta", BedrockBlock::Thinking { text, .. }) => {
                        if let Some(t) = delta
                            .and_then(|d| d.get("thinking"))
                            .and_then(|t| t.as_str())
                        {
                            text.push_str(t);
                            let _ = chunk_tx.send(ProviderStreamChunk::Thought(t.to_string()));
                        }
                    }
                    ("signature_delta", BedrockBlock::Thinking { signature, .. }) => {
                        if let Some(s) = delta
                            .and_then(|d| d.get("signature"))
                            .and_then(|s| s.as_str())
                        {
                            *signature = Some(match signature.take() {
                                Some(mut existing) => {
                                    existing.push_str(s);
                                    existing
                                }
                                None => s.to_string(),
                            });
                        }
                    }
                    ("input_json_delta", BedrockBlock::ToolUse { input_json, .. }) => {
                        if let Some(j) = delta
                            .and_then(|d| d.get("partial_json"))
                            .and_then(|j| j.as_str())
                        {
                            input_json.push_str(j);
                        }
                    }
                    _ => {}
                }
            }
            "message_delta" => {
                if let Some(sr) = value
                    .get("delta")
                    .and_then(|d| d.get("stop_reason"))
                    .and_then(|s| s.as_str())
                {
                    self.stop_reason = Some(sr.to_string());
                }
                if let Some(usage) = value.get("usage").filter(|u| !u.is_null()) {
                    self.merge_usage(usage);
                }
            }
            _ => {}
        }
    }

    // Anthropic splits input tokens onto `message_start` and output tokens onto `message_delta`.
    fn merge_usage(&mut self, usage: &Value) {
        let target = self
            .usage
            .get_or_insert_with(|| Value::Object(Default::default()));
        if let (Some(target_obj), Some(src_obj)) = (target.as_object_mut(), usage.as_object()) {
            for (k, v) in src_obj {
                target_obj.insert(k.clone(), v.clone());
            }
        }
    }

    pub(super) fn into_response(self, model: &str) -> ProviderResponse {
        let mut parts = Vec::new();
        for block in self.blocks {
            match block {
                BedrockBlock::Text { text } => {
                    if !text.is_empty() {
                        parts.push(ProviderPart {
                            text: Some(text),
                            ..Default::default()
                        });
                    }
                }
                BedrockBlock::Thinking { text, signature } => {
                    parts.push(ProviderPart {
                        text: Some(text),
                        thought: Some(true),
                        thought_signature: signature,
                        ..Default::default()
                    });
                }
                BedrockBlock::ToolUse {
                    id,
                    name,
                    input_json,
                } => {
                    let args = if input_json.trim().is_empty() {
                        Some(Value::Object(Default::default()))
                    } else {
                        serde_json::from_str::<Value>(&input_json).ok()
                    };
                    parts.push(ProviderPart {
                        function_call: Some(ProviderFunctionCall { id, name, args }),
                        ..Default::default()
                    });
                }
            }
        }

        ProviderResponse {
            candidates: Some(vec![ProviderCandidate {
                content: Some(ProviderContent {
                    role: Some("model".to_string()),
                    parts: Some(parts),
                }),
                finish_reason: Some(map_stop_reason(self.stop_reason.as_deref().unwrap_or(""))),
            }]),
            usage_metadata: Some(parse_usage(self.usage.as_ref())),
            model_version: Some(model.to_string()),
        }
    }
}
