//! Convert chat messages to LangChain format.
//!
//! We try to be close to the LangChain Python SDK, but slightly more permissive.
//!
//! Things we log and silently skip:
//! - Image raw bytes content part (AI SDK outer span)
//! - Tool call content part - this is because we parse any openllmetry attributes
//!   to this format, which is closer to anthropic. LangChain supports these,
//!   but it *also* supports tool calls besides content (OpenAI format), and that's
//!   what we collect tool calls to.
//! - A tool message without a `tool_call_id`
//! - Tool calls in an assistant message that do not have an `id`

const DEFAULT_TOOL_CALL_ID: &str = "";

use anyhow::Result;
use indexmap::IndexMap;
use serde::Serialize;
use serde_json::Value;

use crate::{
    db::spans::{Span, SpanType},
    language_model::{ChatMessage, ChatMessageContent, ChatMessageContentPart},
    utils::json_value_to_string,
};

use super::openai::OpenAIChatMessageContentPartImageUrl;

#[derive(Serialize, Debug)]
struct LangChainChatMessageContentPartText {
    text: String,
}

#[derive(Serialize, Debug)]
struct LangChainChatMessageContentPartImageOrFileBase64 {
    data: String,
    mime_type: String,
}

#[derive(Serialize, Debug)]
struct LangChainChatMessageContentPartImageOrFileUrl {
    url: String,
}

#[derive(Serialize, Debug)]
#[serde(tag = "source_type", rename_all = "snake_case")]
enum LangChainChatMessageContentPartImage {
    #[serde(rename = "base64")]
    Base64(LangChainChatMessageContentPartImageOrFileBase64),
    Url(LangChainChatMessageContentPartImageOrFileUrl),
}

#[derive(Serialize, Debug)]
#[serde(tag = "source_type", rename_all = "snake_case")]
enum LangChainChatMessageContentPartFile {
    #[serde(rename = "base64")]
    Base64(LangChainChatMessageContentPartImageOrFileBase64),
    Url(LangChainChatMessageContentPartImageOrFileUrl),
}

#[derive(Serialize, Debug)]
#[serde(tag = "source_type", rename_all = "snake_case")]
enum LangChainChatMessageContentPartAudio {
    #[serde(rename = "base64")]
    #[allow(
        dead_code,
        reason = "Indicates audio content parts. Not yet supported."
    )]
    Base64(LangChainChatMessageContentPartImageOrFileBase64),
}

#[derive(Serialize, Debug)]
#[serde(tag = "type", rename_all = "snake_case")]
enum LangChainChatMessageContentPart {
    #[allow(
        dead_code,
        reason = "LangChain allows raw string content parts, but we never convert to them"
    )]
    String,
    Text(LangChainChatMessageContentPartText),
    #[allow(
        dead_code,
        reason = "While LangChain supports OpenAI-style image URLs, we convert to LangChain-style image, source_type=url"
    )]
    ImageUrl(OpenAIChatMessageContentPartImageUrl),
    Image(LangChainChatMessageContentPartImage),
    File(LangChainChatMessageContentPartFile),
    #[allow(
        dead_code,
        reason = "Indicates audio content parts. Not yet supported."
    )]
    Audio(LangChainChatMessageContentPartAudio),
}

#[derive(Serialize)]
#[serde(untagged)]
enum LangChainChatMessageContent {
    Text(String),
    ContentPartList(Vec<LangChainChatMessageContentPart>),
}

#[derive(Serialize)]
struct LangChainUserChatMessage {
    content: LangChainChatMessageContent,
}

#[derive(Serialize)]
struct LangChainChatMessageToolCall {
    id: String,
    name: String,
    /// Even though LangChain `ToolCall` takes `args` field,
    /// when parsing the dicts, it looks for `arguments` field.
    arguments: IndexMap<String, serde_json::Value>,
    #[serde(rename = "type")]
    block_type: String, // always "tool_call"
}

#[derive(Serialize)]
struct LangChainAssistantChatMessage {
    content: Option<LangChainChatMessageContent>,
    tool_calls: Vec<LangChainChatMessageToolCall>,
}

#[derive(Serialize)]
struct LangChainSystemChatMessage {
    content: LangChainChatMessageContent,
}

#[derive(Serialize)]
struct LangChainToolChatMessage {
    content: Value,
    tool_call_id: String,
}

#[derive(Serialize)]
#[serde(tag = "role", rename_all = "snake_case")]
enum LangChainChatMessage {
    User(LangChainUserChatMessage),
    Assistant(LangChainAssistantChatMessage),
    System(LangChainSystemChatMessage),
    Tool(LangChainToolChatMessage),
}

pub fn is_langchain_span(span: &Span) -> bool {
    span.span_type == SpanType::LLM
        && (span
            .attributes
            .raw_attributes
            .get("lmnr.association.properties.ls_provider")
            .is_some())
}

pub fn convert_span_to_langchain(span: &mut Span) {
    let span_input = span
        .input
        .as_ref()
        .and_then(|span_input| serde_json::from_value::<Vec<ChatMessage>>(span_input.clone()).ok());
    let span_output = span.output.as_ref().and_then(|span_output| {
        serde_json::from_value::<Vec<ChatMessage>>(span_output.clone()).ok()
    });

    let converted_input_messages = span_input.and_then(|input_messages| {
        input_messages
            .into_iter()
            .map(|message| message_to_langchain_format(message))
            .collect::<Result<Vec<Value>>>()
            .map_err(|e| log::warn!("Error converting chat message to LangChain format: {}", e))
            .ok()
    });

    let converted_output_messages = span_output.and_then(|output_messages| {
        output_messages
            .into_iter()
            .map(|message| message_to_langchain_format(message))
            .collect::<Result<Vec<Value>>>()
            .map_err(|e| log::warn!("Error converting chat message to LangChain format: {}", e))
            .ok()
    });

    // only update the span if we are successful in parsing the messages in
    // both input and output
    if converted_input_messages.is_some() && converted_output_messages.is_some() {
        span.input = Some(Value::Array(converted_input_messages.unwrap()));
        span.output = Some(Value::Array(converted_output_messages.unwrap()));
    }
}

fn message_to_langchain_format(message: ChatMessage) -> Result<Value> {
    let langchain_message = match message.role.trim().to_lowercase().as_str() {
        "user" => convert_user_message(message)?,
        "system" => convert_system_message(message)?,
        "assistant" => convert_assistant_message(message)?,
        "tool" => convert_tool_message(message)?,
        _ => return Err(anyhow::anyhow!("Invalid role: {}", message.role)),
    };

    Ok(serde_json::to_value(langchain_message)?)
}

fn convert_user_message(message: ChatMessage) -> Result<LangChainChatMessage> {
    let content = convert_to_langchain_content(message.content)?;
    Ok(LangChainChatMessage::User(LangChainUserChatMessage {
        content,
    }))
}

fn convert_system_message(message: ChatMessage) -> Result<LangChainChatMessage> {
    let content = convert_to_langchain_content(message.content)?;
    Ok(LangChainChatMessage::System(LangChainSystemChatMessage {
        content,
    }))
}

fn convert_tool_message(message: ChatMessage) -> Result<LangChainChatMessage> {
    let tool_call_id = message.tool_call_id.unwrap_or_else(|| {
        log::warn!(
            "[LangChain] No tool call ID in tool message. Defaulting to '{}'.",
            DEFAULT_TOOL_CALL_ID
        );
        String::from(DEFAULT_TOOL_CALL_ID)
    });
    Ok(LangChainChatMessage::Tool(LangChainToolChatMessage {
        content: match message.content {
            ChatMessageContent::Text(text) => Value::String(text),
            ChatMessageContent::ContentPartList(parts) => Value::Array(
                parts
                    .into_iter()
                    .map(|part| serde_json::to_value(part)
                        .map_err(|e|
                            anyhow::anyhow!(
                                "Error converting tool chat message content part to LangChain format: {}", e
                            )
                        )
                    )
                    .collect::<Result<Vec<Value>>>()?,
            ),
        },
        tool_call_id,
    }))
}

fn convert_assistant_message(message: ChatMessage) -> Result<LangChainChatMessage> {
    let tool_calls = if let ChatMessageContent::ContentPartList(ref parts) = message.content {
        tool_calls_from_content_parts(parts)?
    } else {
        Vec::new()
    };

    let content = if message.role == "tool" {
        LangChainChatMessageContent::Text("".to_string())
    } else {
        convert_to_langchain_content(message.content)?
    };

    Ok(LangChainChatMessage::Assistant(
        LangChainAssistantChatMessage {
            content: Some(content),
            tool_calls,
        },
    ))
}

fn convert_to_langchain_content(
    content: ChatMessageContent,
) -> Result<LangChainChatMessageContent> {
    match content {
        ChatMessageContent::Text(text) => Ok(LangChainChatMessageContent::Text(text)),
        ChatMessageContent::ContentPartList(parts) => {
            let converted_parts = parts
                .into_iter()
                .filter_map(|v| {
                    // Be permissive: log and skip errors in content part conversion
                    v.try_into()
                        .map_err(|e| {
                            log::warn!(
                                "Error converting chat message content part to LangChain format: {}",
                                e
                            )
                        })
                        .ok()
                        .flatten()
                })
                .collect();
            Ok(LangChainChatMessageContent::ContentPartList(
                converted_parts,
            ))
        }
    }
}

fn tool_calls_from_content_parts(
    content_parts: &Vec<ChatMessageContentPart>,
) -> Result<Vec<LangChainChatMessageToolCall>> {
    content_parts
        .into_iter()
        .filter_map(|v| match v {
            ChatMessageContentPart::ToolCall(tool_call) => {
                let id = tool_call.id.clone().unwrap_or_else(|| {
                    log::warn!(
                        "[LangChain] No tool call ID in tool call. Defaulting to '{}'.",
                        DEFAULT_TOOL_CALL_ID
                    );
                    String::from(DEFAULT_TOOL_CALL_ID)
                });
                let args = match tool_call.arguments.clone() {
                    Some(Value::String(s)) => {
                        serde_json::from_str::<IndexMap<String, Value>>(&s).unwrap_or_default()
                    }
                    Some(Value::Object(o)) => o.into_iter().collect(),
                    _ => IndexMap::new(),
                };
                Some(Ok(LangChainChatMessageToolCall {
                    id,
                    name: tool_call.name.clone(),
                    arguments: args,
                    block_type: "tool_call".to_string(),
                }))
            }
            _ => None,
        })
        .collect()
}

/// Ok(Some(T)) - Success, return the LangChain message content part
/// Ok(None) - Skip, do not include in the LangChain message, expected, e.g. tool calls inside
///            content parts.
/// Err(E) - Error, do not include in the LangChain message, but log the error
impl TryInto<Option<LangChainChatMessageContentPart>> for ChatMessageContentPart {
    type Error = anyhow::Error;

    fn try_into(self) -> Result<Option<LangChainChatMessageContentPart>, Self::Error> {
        match self {
            ChatMessageContentPart::Text(text) => Ok(Some(LangChainChatMessageContentPart::Text(
                LangChainChatMessageContentPartText { text: text.text },
            ))),
            ChatMessageContentPart::AISDKToolResult(tool_result) => Ok(Some(
                LangChainChatMessageContentPart::Text(LangChainChatMessageContentPartText {
                    text: json_value_to_string(&tool_result.output),
                }),
            )),
            ChatMessageContentPart::ImageUrl(image_url) => Ok(Some(
                LangChainChatMessageContentPart::Image(LangChainChatMessageContentPartImage::Url(
                    LangChainChatMessageContentPartImageOrFileUrl { url: image_url.url },
                )),
            )),
            ChatMessageContentPart::Image(image) => {
                Ok(Some(LangChainChatMessageContentPart::Image(
                    LangChainChatMessageContentPartImage::Base64(
                        LangChainChatMessageContentPartImageOrFileBase64 {
                            data: image.data,
                            mime_type: image.media_type,
                        },
                    ),
                )))
            }
            ChatMessageContentPart::Document(document) => Ok(Some(
                LangChainChatMessageContentPart::File(LangChainChatMessageContentPartFile::Base64(
                    LangChainChatMessageContentPartImageOrFileBase64 {
                        data: document.source.data,
                        mime_type: document.source.media_type,
                    },
                )),
            )),
            ChatMessageContentPart::DocumentUrl(document_url) => Ok(Some(
                LangChainChatMessageContentPart::File(LangChainChatMessageContentPartFile::Url(
                    LangChainChatMessageContentPartImageOrFileUrl {
                        url: document_url.url,
                    },
                )),
            )),
            // LangChain CAN accept tool calls inside content parts, but we put them
            // in the tool_calls field instead, similar to OpenAI, so we skip them here.
            ChatMessageContentPart::ToolCall(_) => Ok(None),
            ChatMessageContentPart::ImageRawBytes(_) => Err(anyhow::anyhow!(
                "Image raw bytes is not supported in LangChain"
            )),
        }
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use super::*;
    use crate::{
        language_model::{
            ChatMessageContentPart, ChatMessageDocument, ChatMessageDocumentSource,
            ChatMessageDocumentUrl, ChatMessageImage, ChatMessageImageRawBytes,
            ChatMessageImageUrl, ChatMessageText, ChatMessageToolCall,
        },
        traces::spans::SpanAttributes,
    };
    use serde_json::json;

    // Simple text message tests
    #[test]
    fn test_simple_text_message() {
        let message = ChatMessage {
            role: "user".to_string(),
            content: ChatMessageContent::Text("Hello, world!".to_string()),
            tool_call_id: None,
        };
        let langchain_message = message_to_langchain_format(message).unwrap();

        assert_eq!(langchain_message["role"], "user");
        assert_eq!(langchain_message["content"], "Hello, world!");
    }

    #[test]
    fn test_text_message_with_tool_call_id() {
        let message = ChatMessage {
            role: "tool".to_string(),
            content: ChatMessageContent::Text("Tool response".to_string()),
            tool_call_id: Some("call_123".to_string()),
        };
        let langchain_message = message_to_langchain_format(message).unwrap();

        assert_eq!(langchain_message["role"], "tool");
        assert_eq!(langchain_message["content"], "Tool response");
        assert_eq!(langchain_message["tool_call_id"], "call_123");
    }

    #[test]
    fn test_assistant_role_message() {
        let message = ChatMessage {
            role: "assistant".to_string(),
            content: ChatMessageContent::Text("How can I help you?".to_string()),
            tool_call_id: None,
        };
        let langchain_message = message_to_langchain_format(message).unwrap();

        assert_eq!(langchain_message["role"], "assistant");
        assert_eq!(langchain_message["content"], "How can I help you?");
        assert!(
            langchain_message["tool_calls"]
                .as_array()
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn test_system_role_message() {
        let message = ChatMessage {
            role: "system".to_string(),
            content: ChatMessageContent::Text("You are a helpful assistant.".to_string()),
            tool_call_id: None,
        };
        let langchain_message = message_to_langchain_format(message).unwrap();

        assert_eq!(langchain_message["role"], "system");
        assert_eq!(langchain_message["content"], "You are a helpful assistant.");
    }

    // Content part list tests
    #[test]
    fn test_content_part_list_with_text_only() {
        let message = ChatMessage {
            role: "user".to_string(),
            content: ChatMessageContent::ContentPartList(vec![
                ChatMessageContentPart::Text(ChatMessageText {
                    text: "First part".to_string(),
                }),
                ChatMessageContentPart::Text(ChatMessageText {
                    text: "Second part".to_string(),
                }),
            ]),
            tool_call_id: None,
        };
        let langchain_message = message_to_langchain_format(message).unwrap();

        assert_eq!(langchain_message["role"], "user");
        assert!(langchain_message["content"].is_array());
        let content_array = langchain_message["content"].as_array().unwrap();
        assert_eq!(content_array.len(), 2);
        assert_eq!(content_array[0]["type"], "text");
        assert_eq!(content_array[0]["text"], "First part");
        assert_eq!(content_array[1]["type"], "text");
        assert_eq!(content_array[1]["text"], "Second part");
    }

    #[test]
    fn test_content_part_list_with_image_url() {
        let message = ChatMessage {
            role: "user".to_string(),
            content: ChatMessageContent::ContentPartList(vec![
                ChatMessageContentPart::Text(ChatMessageText {
                    text: "What's in this image?".to_string(),
                }),
                ChatMessageContentPart::ImageUrl(ChatMessageImageUrl {
                    url: "https://example.com/image.jpg".to_string(),
                    detail: Some("high".to_string()),
                }),
            ]),
            tool_call_id: None,
        };
        let langchain_message = message_to_langchain_format(message).unwrap();

        assert_eq!(langchain_message["role"], "user");
        let content_array = langchain_message["content"].as_array().unwrap();
        assert_eq!(content_array.len(), 2);

        assert_eq!(content_array[0]["type"], "text");
        assert_eq!(content_array[0]["text"], "What's in this image?");

        assert_eq!(content_array[1]["type"], "image");
        assert_eq!(content_array[1]["url"], "https://example.com/image.jpg");
        assert_eq!(content_array[1]["source_type"], "url");
    }

    #[test]
    fn test_content_part_list_with_image_url_no_detail() {
        let message = ChatMessage {
            role: "user".to_string(),
            content: ChatMessageContent::ContentPartList(vec![ChatMessageContentPart::ImageUrl(
                ChatMessageImageUrl {
                    url: "https://example.com/simple.jpg".to_string(),
                    detail: None,
                },
            )]),
            tool_call_id: None,
        };
        let langchain_message = message_to_langchain_format(message).unwrap();

        let content_array = langchain_message["content"].as_array().unwrap();
        assert_eq!(content_array[0]["type"], "image");
        assert_eq!(content_array[0]["url"], "https://example.com/simple.jpg");
        assert_eq!(content_array[0]["source_type"], "url");
    }

    #[test]
    fn test_content_part_list_with_base64_image() {
        let message = ChatMessage {
            role: "user".to_string(),
            content: ChatMessageContent::ContentPartList(vec![
                ChatMessageContentPart::Image(ChatMessageImage {
                    media_type: "image/png".to_string(),
                    data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==".to_string(),
                }),
            ]),
            tool_call_id: None,
        };
        let langchain_message = message_to_langchain_format(message).unwrap();

        let content_array = langchain_message["content"].as_array().unwrap();
        assert_eq!(content_array[0]["type"], "image");
        assert_eq!(content_array[0]["source_type"], "base64");
        assert_eq!(
            content_array[0]["data"],
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="
        );
        assert_eq!(content_array[0]["mime_type"], "image/png");
    }

    #[test]
    fn test_content_part_list_with_document() {
        let message = ChatMessage {
            role: "user".to_string(),
            content: ChatMessageContent::ContentPartList(vec![ChatMessageContentPart::Document(
                ChatMessageDocument {
                    source: ChatMessageDocumentSource {
                        document_type: "base64".to_string(),
                        data: "SGVsbG8gV29ybGQ=".to_string(), // "Hello World" in base64
                        media_type: "text/plain".to_string(),
                    },
                },
            )]),
            tool_call_id: None,
        };
        let langchain_message = message_to_langchain_format(message).unwrap();

        let content_array = langchain_message["content"].as_array().unwrap();
        assert_eq!(content_array[0]["type"], "file");
        assert_eq!(content_array[0]["source_type"], "base64");
        assert_eq!(content_array[0]["data"], "SGVsbG8gV29ybGQ=");
        assert_eq!(content_array[0]["mime_type"], "text/plain");
    }

    #[test]
    fn test_content_part_list_with_document_url() {
        let message = ChatMessage {
            role: "user".to_string(),
            content: ChatMessageContent::ContentPartList(vec![
                ChatMessageContentPart::DocumentUrl(ChatMessageDocumentUrl {
                    url: "https://example.com/document.pdf".to_string(),
                    media_type: "application/pdf".to_string(),
                }),
            ]),
            tool_call_id: None,
        };
        let langchain_message = message_to_langchain_format(message).unwrap();

        let content_array = langchain_message["content"].as_array().unwrap();
        assert_eq!(content_array[0]["type"], "file");
        assert_eq!(content_array[0]["source_type"], "url");
        assert_eq!(content_array[0]["url"], "https://example.com/document.pdf");
    }

    // Tool call tests
    #[test]
    fn test_message_with_single_tool_call() {
        let tool_call = ChatMessageToolCall {
            id: Some("call_abc123".to_string()),
            name: "get_weather".to_string(),
            arguments: Some(json!({"location": "San Francisco", "unit": "celsius"})),
        };

        let message = ChatMessage {
            role: "assistant".to_string(),
            content: ChatMessageContent::ContentPartList(vec![
                ChatMessageContentPart::Text(ChatMessageText {
                    text: "Let me check the weather for you.".to_string(),
                }),
                ChatMessageContentPart::ToolCall(tool_call),
            ]),
            tool_call_id: None,
        };
        let langchain_message = message_to_langchain_format(message).unwrap();

        assert_eq!(langchain_message["role"], "assistant");

        // Check content (should only include text, not tool calls)
        let content_array = langchain_message["content"].as_array().unwrap();
        assert_eq!(content_array.len(), 1);
        assert_eq!(content_array[0]["type"], "text");
        assert_eq!(
            content_array[0]["text"],
            "Let me check the weather for you."
        );

        // Check tool_calls
        let tool_calls = langchain_message["tool_calls"].as_array().unwrap();
        assert_eq!(tool_calls.len(), 1);
        assert_eq!(tool_calls[0]["type"], "tool_call");
        assert_eq!(tool_calls[0]["id"], "call_abc123");
        assert_eq!(tool_calls[0]["name"], "get_weather");

        // LangChain uses args as an object, not a JSON string like OpenAI
        let args = &tool_calls[0]["arguments"];
        assert_eq!(args["location"], "San Francisco");
        assert_eq!(args["unit"], "celsius");
    }

    #[test]
    fn test_message_with_multiple_tool_calls() {
        let tool_call1 = ChatMessageToolCall {
            id: Some("call_1".to_string()),
            name: "function_1".to_string(),
            arguments: Some(json!({"param": "value1"})),
        };

        let tool_call2 = ChatMessageToolCall {
            id: Some("call_2".to_string()),
            name: "function_2".to_string(),
            arguments: Some(json!({"param": "value2"})),
        };

        let message = ChatMessage {
            role: "assistant".to_string(),
            content: ChatMessageContent::ContentPartList(vec![
                ChatMessageContentPart::ToolCall(tool_call1),
                ChatMessageContentPart::ToolCall(tool_call2),
            ]),
            tool_call_id: None,
        };
        let langchain_message = message_to_langchain_format(message).unwrap();

        // Check tool_calls
        let tool_calls = langchain_message["tool_calls"].as_array().unwrap();
        assert_eq!(tool_calls.len(), 2);

        assert_eq!(tool_calls[0]["id"], "call_1");
        assert_eq!(tool_calls[0]["name"], "function_1");
        assert_eq!(tool_calls[0]["arguments"]["param"], "value1");

        assert_eq!(tool_calls[1]["id"], "call_2");
        assert_eq!(tool_calls[1]["name"], "function_2");
        assert_eq!(tool_calls[1]["arguments"]["param"], "value2");
    }

    #[test]
    fn test_tool_call_with_missing_id() {
        let tool_call = ChatMessageToolCall {
            id: None,
            name: "test_function".to_string(),
            arguments: Some(json!({})),
        };

        let message = ChatMessage {
            role: "assistant".to_string(),
            content: ChatMessageContent::ContentPartList(vec![ChatMessageContentPart::ToolCall(
                tool_call,
            )]),
            tool_call_id: None,
        };

        let result = message_to_langchain_format(message);
        assert!(result.is_ok());
        assert!(result.unwrap()["tool_calls"].as_array().unwrap()[0]["id"] == "");
    }

    #[test]
    fn test_tool_call_with_complex_arguments() {
        let complex_args = json!({
            "nested": {
                "array": [1, 2, 3],
                "string": "test",
                "boolean": true,
                "null_value": null
            },
            "top_level": "value"
        });

        let tool_call = ChatMessageToolCall {
            id: Some("call_complex".to_string()),
            name: "complex_function".to_string(),
            arguments: Some(complex_args.clone()),
        };

        let message = ChatMessage {
            role: "assistant".to_string(),
            content: ChatMessageContent::ContentPartList(vec![ChatMessageContentPart::ToolCall(
                tool_call,
            )]),
            tool_call_id: None,
        };
        let langchain_message = message_to_langchain_format(message).unwrap();

        let tool_calls = langchain_message["tool_calls"].as_array().unwrap();
        let args = &tool_calls[0]["arguments"];
        assert_eq!(*args, complex_args);
    }

    #[test]
    fn test_tool_call_with_string_arguments() {
        let tool_call = ChatMessageToolCall {
            id: Some("call_string_args".to_string()),
            name: "string_args_function".to_string(),
            arguments: Some(Value::String("{\"key\": \"value\"}".to_string())),
        };

        let message = ChatMessage {
            role: "assistant".to_string(),
            content: ChatMessageContent::ContentPartList(vec![ChatMessageContentPart::ToolCall(
                tool_call,
            )]),
            tool_call_id: None,
        };
        let langchain_message = message_to_langchain_format(message).unwrap();

        let tool_calls = langchain_message["tool_calls"].as_array().unwrap();
        let args = &tool_calls[0]["arguments"];
        assert_eq!(args["key"], "value");
    }

    // Mixed content tests
    #[test]
    fn test_mixed_content_with_text_image_and_tool_call() {
        let tool_call = ChatMessageToolCall {
            id: Some("call_mixed".to_string()),
            name: "analyze_image".to_string(),
            arguments: Some(json!({"format": "detailed"})),
        };

        let message = ChatMessage {
            role: "assistant".to_string(),
            content: ChatMessageContent::ContentPartList(vec![
                ChatMessageContentPart::Text(ChatMessageText {
                    text: "I'll analyze this image for you.".to_string(),
                }),
                ChatMessageContentPart::ImageUrl(ChatMessageImageUrl {
                    url: "https://example.com/analyze.jpg".to_string(),
                    detail: Some("high".to_string()),
                }),
                ChatMessageContentPart::ToolCall(tool_call),
            ]),
            tool_call_id: None,
        };

        let langchain_message = message_to_langchain_format(message).unwrap();

        // Check content (should exclude tool calls)
        let content_array = langchain_message["content"].as_array().unwrap();
        assert_eq!(content_array.len(), 2);
        assert_eq!(content_array[0]["type"], "text");
        assert_eq!(content_array[1]["type"], "image");
        assert_eq!(content_array[1]["source_type"], "url");
        assert_eq!(content_array[1]["url"], "https://example.com/analyze.jpg");

        // Check tool_calls
        let tool_calls = langchain_message["tool_calls"].as_array().unwrap();
        assert_eq!(tool_calls.len(), 1);
        assert_eq!(tool_calls[0]["name"], "analyze_image");
    }

    #[test]
    fn test_mixed_content_with_both_image_types() {
        let message = ChatMessage {
            role: "user".to_string(),
            content: ChatMessageContent::ContentPartList(vec![
                ChatMessageContentPart::ImageUrl(ChatMessageImageUrl {
                    url: "https://example.com/image.jpg".to_string(),
                    detail: None,
                }),
                ChatMessageContentPart::Image(ChatMessageImage {
                    media_type: "image/png".to_string(),
                    data: "base64data".to_string(),
                }),
            ]),
            tool_call_id: None,
        };

        let langchain_message = message_to_langchain_format(message).unwrap();

        let content_array = langchain_message["content"].as_array().unwrap();
        assert_eq!(content_array.len(), 2);

        // First should be image_url type (OpenAI format)
        assert_eq!(content_array[0]["type"], "image");
        assert_eq!(content_array[0]["url"], "https://example.com/image.jpg");
        assert_eq!(content_array[0]["source_type"], "url");

        // Second should be image type (LangChain format)
        assert_eq!(content_array[1]["type"], "image");
        assert_eq!(content_array[1]["source_type"], "base64");
        assert_eq!(content_array[1]["data"], "base64data");
    }

    // Error handling and edge cases
    #[test]
    fn test_empty_content_part_list() {
        let message = ChatMessage {
            role: "user".to_string(),
            content: ChatMessageContent::ContentPartList(vec![]),
            tool_call_id: None,
        };
        let langchain_message = message_to_langchain_format(message).unwrap();

        assert!(langchain_message["content"].is_array());
        let content_array = langchain_message["content"].as_array().unwrap();
        assert_eq!(content_array.len(), 0);
    }

    #[test]
    fn test_empty_text_message() {
        let message = ChatMessage {
            role: "user".to_string(),
            content: ChatMessageContent::Text("".to_string()),
            tool_call_id: None,
        };
        let langchain_message = message_to_langchain_format(message).unwrap();

        assert_eq!(langchain_message["content"], "");
    }

    #[test]
    fn test_content_part_conversion_text() {
        let part = ChatMessageContentPart::Text(ChatMessageText {
            text: "Hello".to_string(),
        });
        let langchain_part: Option<LangChainChatMessageContentPart> = part.try_into().unwrap();
        let langchain_part = langchain_part.unwrap();
        let serialized = serde_json::to_value(langchain_part).unwrap();

        assert_eq!(serialized["type"], "text");
        assert_eq!(serialized["text"], "Hello");
    }

    #[test]
    fn test_content_part_conversion_image_url() {
        let part = ChatMessageContentPart::ImageUrl(ChatMessageImageUrl {
            url: "https://example.com/test.jpg".to_string(),
            detail: Some("low".to_string()),
        });
        let langchain_part: Option<LangChainChatMessageContentPart> = part.try_into().unwrap();
        let langchain_part = langchain_part.unwrap();
        let serialized = serde_json::to_value(langchain_part).unwrap();

        assert_eq!(serialized["type"], "image");
        assert_eq!(serialized["source_type"], "url");
        assert_eq!(serialized["url"], "https://example.com/test.jpg");
    }

    #[test]
    fn test_content_part_conversion_document_url_success() {
        let part = ChatMessageContentPart::DocumentUrl(ChatMessageDocumentUrl {
            url: "https://example.com/doc.pdf".to_string(),
            media_type: "application/pdf".to_string(),
        });
        let langchain_part: Option<LangChainChatMessageContentPart> = part.try_into().unwrap();
        let langchain_part = langchain_part.unwrap();
        let serialized = serde_json::to_value(langchain_part).unwrap();

        assert_eq!(serialized["type"], "file");
        assert_eq!(serialized["source_type"], "url");
        assert_eq!(serialized["url"], "https://example.com/doc.pdf");
    }

    #[test]
    fn test_content_part_conversion_tool_call() {
        let part = ChatMessageContentPart::ToolCall(ChatMessageToolCall {
            id: Some("test".to_string()),
            name: "test".to_string(),
            arguments: Some(json!({})),
        });
        let result: Option<LangChainChatMessageContentPart> = part.try_into().unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn test_content_part_conversion_image_raw_bytes_error() {
        let part = ChatMessageContentPart::ImageRawBytes(ChatMessageImageRawBytes {
            image: vec![1, 2, 3, 4],
            mime_type: Some("image/png".to_string()),
        });
        let result: Result<Option<LangChainChatMessageContentPart>, _> = part.try_into();
        assert!(result.is_err());
        assert!(
            result
                .unwrap_err()
                .to_string()
                .contains("Image raw bytes is not supported in LangChain")
        );
    }

    // Span conversion tests
    #[test]
    fn test_convert_span_to_langchain_with_input_and_output() {
        let input_messages = vec![ChatMessage {
            role: "user".to_string(),
            content: ChatMessageContent::Text("Hello".to_string()),
            tool_call_id: None,
        }];

        let output_messages = vec![ChatMessage {
            role: "assistant".to_string(),
            content: ChatMessageContent::Text("Hi there!".to_string()),
            tool_call_id: None,
        }];

        let mut span = Span {
            input: Some(serde_json::to_value(input_messages).unwrap()),
            output: Some(serde_json::to_value(output_messages).unwrap()),
            ..Default::default()
        };

        convert_span_to_langchain(&mut span);

        // Check input conversion
        let input_array = span.input.as_ref().unwrap().as_array().unwrap();
        assert_eq!(input_array.len(), 1);
        assert_eq!(input_array[0]["role"], "user");
        assert_eq!(input_array[0]["content"], "Hello");

        // Check output conversion
        let output_array = span.output.as_ref().unwrap().as_array().unwrap();
        assert_eq!(output_array.len(), 1);
        assert_eq!(output_array[0]["role"], "assistant");
        assert_eq!(output_array[0]["content"], "Hi there!");
        assert!(output_array[0]["tool_calls"].as_array().unwrap().is_empty());
    }

    #[test]
    fn test_convert_span_to_langchain_with_input_only() {
        let input_messages = vec![
            ChatMessage {
                role: "system".to_string(),
                content: ChatMessageContent::Text("You are helpful".to_string()),
                tool_call_id: None,
            },
            ChatMessage {
                role: "user".to_string(),
                content: ChatMessageContent::Text("Help me".to_string()),
                tool_call_id: None,
            },
        ];

        let mut span = Span {
            input: Some(serde_json::to_value(input_messages).unwrap()),
            output: None,
            ..Default::default()
        };

        convert_span_to_langchain(&mut span);

        let input_array = span.input.as_ref().unwrap().as_array().unwrap();
        assert_eq!(input_array.len(), 2);
        assert_eq!(input_array[0]["role"], "system");
        assert_eq!(input_array[1]["role"], "user");
        assert!(span.output.is_none());
    }

    #[test]
    fn test_convert_span_to_langchain_with_no_messages() {
        let mut span = Span {
            input: None,
            output: None,
            ..Default::default()
        };

        convert_span_to_langchain(&mut span);

        assert!(span.input.is_none());
        assert!(span.output.is_none());
    }

    #[test]
    fn test_convert_span_to_langchain_with_invalid_input() {
        let mut span = Span {
            input: Some(json!({"invalid": "data"})),
            output: Some(json!("not an array")),
            ..Default::default()
        };

        convert_span_to_langchain(&mut span);

        // Should remain unchanged when conversion fails
        assert_eq!(span.input.unwrap(), json!({"invalid": "data"}));
        assert_eq!(span.output.unwrap(), json!("not an array"));
    }

    #[test]
    fn test_convert_span_to_langchain_with_complex_messages() {
        let tool_call = ChatMessageToolCall {
            id: Some("call_test".to_string()),
            name: "search".to_string(),
            arguments: Some(json!({"query": "rust programming"})),
        };

        let input_messages = vec![ChatMessage {
            role: "user".to_string(),
            content: ChatMessageContent::ContentPartList(vec![
                ChatMessageContentPart::Text(ChatMessageText {
                    text: "Search for information".to_string(),
                }),
                ChatMessageContentPart::ImageUrl(ChatMessageImageUrl {
                    url: "https://example.com/rust-logo.png".to_string(),
                    detail: None,
                }),
                ChatMessageContentPart::DocumentUrl(ChatMessageDocumentUrl {
                    url: "https://example.com/rust-docs.pdf".to_string(),
                    media_type: "application/pdf".to_string(),
                }),
            ]),
            tool_call_id: None,
        }];

        let output_messages = vec![ChatMessage {
            role: "assistant".to_string(),
            content: ChatMessageContent::ContentPartList(vec![
                ChatMessageContentPart::Text(ChatMessageText {
                    text: "I'll search for that information.".to_string(),
                }),
                ChatMessageContentPart::ToolCall(tool_call),
            ]),
            tool_call_id: None,
        }];

        let mut span = Span {
            input: Some(serde_json::to_value(input_messages).unwrap()),
            output: Some(serde_json::to_value(output_messages).unwrap()),
            ..Default::default()
        };

        convert_span_to_langchain(&mut span);

        // Check complex input conversion
        let input_array = span.input.as_ref().unwrap().as_array().unwrap();
        assert_eq!(input_array.len(), 1);
        let input_content = input_array[0]["content"].as_array().unwrap();
        assert_eq!(input_content.len(), 3);
        assert_eq!(input_content[0]["type"], "text");
        assert_eq!(input_content[1]["type"], "image");
        assert_eq!(input_content[1]["source_type"], "url");
        assert_eq!(input_content[2]["type"], "file");
        assert_eq!(input_content[2]["source_type"], "url");

        // Check complex output conversion with tool calls
        let output_array = span.output.as_ref().unwrap().as_array().unwrap();
        assert_eq!(output_array.len(), 1);
        let output_content = output_array[0]["content"].as_array().unwrap();
        assert_eq!(output_content.len(), 1); // Tool calls filtered out of content
        assert_eq!(output_content[0]["type"], "text");

        let tool_calls = output_array[0]["tool_calls"].as_array().unwrap();
        assert_eq!(tool_calls.len(), 1);
        assert_eq!(tool_calls[0]["name"], "search");
        assert_eq!(tool_calls[0]["arguments"]["query"], "rust programming");
    }

    // Serialization format tests
    #[test]
    fn test_langchain_message_serialization_format() {
        let message = ChatMessage {
            role: "user".to_string(),
            content: ChatMessageContent::ContentPartList(vec![ChatMessageContentPart::Text(
                ChatMessageText {
                    text: "Hello".to_string(),
                },
            )]),
            tool_call_id: Some("call_123".to_string()),
        };
        let langchain_message = message_to_langchain_format(message).unwrap();

        // Verify the exact structure matches LangChain expectations
        assert!(langchain_message.is_object());
        assert!(langchain_message["role"].is_string());
        assert!(langchain_message["content"].is_array());
    }

    #[test]
    fn test_langchain_tool_call_serialization_format() {
        let tool_call = ChatMessageToolCall {
            id: Some("call_func".to_string()),
            name: "get_time".to_string(),
            arguments: Some(json!({"timezone": "UTC"})),
        };

        let message = ChatMessage {
            role: "assistant".to_string(),
            content: ChatMessageContent::ContentPartList(vec![ChatMessageContentPart::ToolCall(
                tool_call,
            )]),
            tool_call_id: None,
        };
        let langchain_message = message_to_langchain_format(message).unwrap();

        let tool_calls = langchain_message["tool_calls"].as_array().unwrap();
        let tool_call_obj = &tool_calls[0];

        // Verify exact LangChain tool call structure
        assert_eq!(tool_call_obj["type"], "tool_call");
        assert!(tool_call_obj["id"].is_string());
        assert!(tool_call_obj["name"].is_string());
        assert!(tool_call_obj["arguments"].is_object());

        // Arguments should be object, not string like OpenAI
        assert_eq!(tool_call_obj["arguments"]["timezone"], "UTC");
    }

    #[test]
    fn test_is_langchain_span() {
        use crate::db::spans::SpanType;

        // Test with ls_provider attribute
        let span_with_provider = Span {
            span_type: SpanType::LLM,
            attributes: {
                let mut attrs = HashMap::new();
                attrs.insert(
                    "lmnr.association.properties.ls_provider".to_string(),
                    serde_json::Value::String("openai".to_string()),
                );
                SpanAttributes::new(attrs)
            },
            ..Default::default()
        };
        assert!(is_langchain_span(&span_with_provider));

        // Test with non-LLM span type
        let non_llm_span = Span {
            span_type: SpanType::DEFAULT,
            attributes: {
                let mut attrs = HashMap::new();
                attrs.insert(
                    "lmnr.association.properties.ls_provider".to_string(),
                    serde_json::Value::String("openai".to_string()),
                );
                SpanAttributes::new(attrs)
            },
            ..Default::default()
        };
        assert!(!is_langchain_span(&non_llm_span));

        // Test with neither attribute nor name pattern
        let regular_span = Span {
            span_type: SpanType::LLM,
            name: "regular_span".to_string(),
            ..Default::default()
        };
        assert!(!is_langchain_span(&regular_span));
    }

    // Error handling tests
    #[test]
    fn test_tool_message_without_tool_call_id_default() {
        let message = ChatMessage {
            role: "tool".to_string(),
            content: ChatMessageContent::Text("Tool response".to_string()),
            tool_call_id: None,
        };

        let result = message_to_langchain_format(message);
        assert!(result.is_ok());
        assert!(result.unwrap()["tool_call_id"] == "");
    }

    #[test]
    fn test_assistant_tool_call_without_id_default() {
        let tool_call = ChatMessageToolCall {
            id: None,
            name: "test_function".to_string(),
            arguments: Some(json!({})),
        };

        let message = ChatMessage {
            role: "assistant".to_string(),
            content: ChatMessageContent::ContentPartList(vec![ChatMessageContentPart::ToolCall(
                tool_call,
            )]),
            tool_call_id: None,
        };

        let result = message_to_langchain_format(message);
        assert!(result.is_ok());
        assert!(result.unwrap()["tool_calls"].as_array().unwrap()[0]["id"] == "");
    }

    #[test]
    fn test_invalid_role_error() {
        let message = ChatMessage {
            role: "invalid_role".to_string(),
            content: ChatMessageContent::Text("Test".to_string()),
            tool_call_id: None,
        };

        let result = message_to_langchain_format(message);
        assert!(result.is_err());
        assert!(
            result
                .unwrap_err()
                .to_string()
                .contains("Invalid role: invalid_role")
        );
    }

    // Span integrity tests - verify span remains unchanged when conversion fails
    #[test]
    fn test_span_remains_intact_on_input_conversion_error() {
        // Tool message without tool_call_id
        let invalid_input_messages = vec![ChatMessage {
            role: "unknown".to_string(),
            content: ChatMessageContent::Text("Tool response".to_string()),
            tool_call_id: None,
        }];

        let valid_output_messages = vec![ChatMessage {
            role: "assistant".to_string(),
            content: ChatMessageContent::Text("Hello".to_string()),
            tool_call_id: None,
        }];

        let original_input = serde_json::to_value(&invalid_input_messages).unwrap();
        let original_output = serde_json::to_value(&valid_output_messages).unwrap();

        let mut span = Span {
            input: Some(original_input.clone()),
            output: Some(original_output.clone()),
            ..Default::default()
        };

        convert_span_to_langchain(&mut span);

        // Span should remain unchanged because input conversion failed
        assert_eq!(span.input.as_ref().unwrap(), &original_input);
        assert_eq!(span.output.as_ref().unwrap(), &original_output);
    }

    #[test]
    fn test_span_remains_intact_on_output_conversion_error() {
        let valid_input_messages = vec![ChatMessage {
            role: "user".to_string(),
            content: ChatMessageContent::Text("Hello".to_string()),
            tool_call_id: None,
        }];

        let invalid_output_messages = vec![ChatMessage {
            role: "unknown".to_string(),
            content: ChatMessageContent::ContentPartList(vec![ChatMessageContentPart::ToolCall(
                ChatMessageToolCall {
                    id: None,
                    name: "test".to_string(),
                    arguments: Some(json!({})),
                },
            )]),
            tool_call_id: None,
        }];

        let original_input = serde_json::to_value(&valid_input_messages).unwrap();
        let original_output = serde_json::to_value(&invalid_output_messages).unwrap();

        let mut span = Span {
            input: Some(original_input.clone()),
            output: Some(original_output.clone()),
            ..Default::default()
        };

        convert_span_to_langchain(&mut span);

        // Span should remain unchanged because output conversion failed
        assert_eq!(span.input.as_ref().unwrap(), &original_input);
        assert_eq!(span.output.as_ref().unwrap(), &original_output);
    }

    #[test]
    fn test_span_remains_intact_on_both_conversion_errors() {
        let invalid_input_messages = vec![ChatMessage {
            role: "invalid_role".to_string(),
            content: ChatMessageContent::Text("Tool response".to_string()),
            tool_call_id: None,
        }];

        let invalid_output_messages = vec![ChatMessage {
            role: "invalid_role".to_string(),
            content: ChatMessageContent::Text("Response".to_string()),
            tool_call_id: None,
        }];

        let original_input = serde_json::to_value(&invalid_input_messages).unwrap();
        let original_output = serde_json::to_value(&invalid_output_messages).unwrap();

        let mut span = Span {
            input: Some(original_input.clone()),
            output: Some(original_output.clone()),
            ..Default::default()
        };

        convert_span_to_langchain(&mut span);

        // Span should remain unchanged because both conversions failed
        assert_eq!(span.input.as_ref().unwrap(), &original_input);
        assert_eq!(span.output.as_ref().unwrap(), &original_output);
    }

    #[test]
    fn test_span_partial_conversion_success_still_leaves_intact() {
        // Test case where input conversion succeeds but output fails
        let valid_input_messages = vec![ChatMessage {
            role: "user".to_string(),
            content: ChatMessageContent::Text("Valid input".to_string()),
            tool_call_id: None,
        }];

        let invalid_output_messages = vec![ChatMessage {
            role: "invalid_role".to_string(),
            content: ChatMessageContent::Text("Tool response".to_string()),
            tool_call_id: None,
        }];

        let original_input = serde_json::to_value(&valid_input_messages).unwrap();
        let original_output = serde_json::to_value(&invalid_output_messages).unwrap();

        let mut span = Span {
            input: Some(original_input.clone()),
            output: Some(original_output.clone()),
            ..Default::default()
        };

        convert_span_to_langchain(&mut span);

        // Even though input conversion would succeed, span should remain unchanged
        // because output conversion failed
        assert_eq!(span.input.as_ref().unwrap(), &original_input);
        assert_eq!(span.output.as_ref().unwrap(), &original_output);
    }

    #[test]
    fn test_span_with_mixed_valid_invalid_messages_in_array() {
        // Test case where some messages in the array are valid but others are not
        let mixed_input_messages = vec![
            // valid user message
            ChatMessage {
                role: "user".to_string(),
                content: ChatMessageContent::Text("Valid message".to_string()),
                tool_call_id: None,
            },
            ChatMessage {
                role: "unknown".to_string(),
                content: ChatMessageContent::Text("Tool response".to_string()),
                tool_call_id: None,
            },
        ];

        let valid_output_messages = vec![ChatMessage {
            role: "assistant".to_string(),
            content: ChatMessageContent::Text("Response".to_string()),
            tool_call_id: None,
        }];

        let original_input = serde_json::to_value(&mixed_input_messages).unwrap();
        let original_output = serde_json::to_value(&valid_output_messages).unwrap();

        let mut span = Span {
            input: Some(original_input.clone()),
            output: Some(original_output.clone()),
            ..Default::default()
        };

        convert_span_to_langchain(&mut span);

        // Should remain unchanged because one message in input array failed conversion
        assert_eq!(span.input.as_ref().unwrap(), &original_input);
        assert_eq!(span.output.as_ref().unwrap(), &original_output);
    }

    #[test]
    fn test_span_with_non_array_json_remains_intact() {
        // Test case where span has non-array JSON that can't be parsed as Vec<ChatMessage>
        let original_input = json!({"not": "an array"});
        let original_output = json!("just a string");

        let mut span = Span {
            input: Some(original_input.clone()),
            output: Some(original_output.clone()),
            ..Default::default()
        };

        convert_span_to_langchain(&mut span);

        // Should remain unchanged because parsing failed
        assert_eq!(span.input.as_ref().unwrap(), &original_input);
        assert_eq!(span.output.as_ref().unwrap(), &original_output);
    }

    // Test permissive user message conversion (logs warnings but continues)
    #[test]
    fn test_user_message_with_unsupported_content_parts_logs_and_continues() {
        let message = ChatMessage {
            role: "user".to_string(),
            content: ChatMessageContent::ContentPartList(vec![
                ChatMessageContentPart::Text(ChatMessageText {
                    text: "Valid text".to_string(),
                }),
                // unsupported content part
                ChatMessageContentPart::ImageRawBytes(ChatMessageImageRawBytes {
                    image: vec![1, 2, 3],
                    mime_type: Some("image/png".to_string()),
                }),
                ChatMessageContentPart::Text(ChatMessageText {
                    text: "Another valid text".to_string(),
                }),
            ]),
            tool_call_id: None,
        };

        // Should succeed but filter out unsupported parts
        let langchain_message = message_to_langchain_format(message).unwrap();
        let content_array = langchain_message["content"].as_array().unwrap();

        // Should only contain the two text parts, unsupported parts should be filtered out
        assert_eq!(content_array.len(), 2);
        assert_eq!(content_array[0]["type"], "text");
        assert_eq!(content_array[0]["text"], "Valid text");
        assert_eq!(content_array[1]["type"], "text");
        assert_eq!(content_array[1]["text"], "Another valid text");
    }

    // Test LangChain's more permissive behavior compared to OpenAI
    #[test]
    fn test_system_message_with_mixed_content_parts_succeeds() {
        // LangChain is more permissive - system messages may contain non-text content parts
        let message = ChatMessage {
            role: "system".to_string(),
            content: ChatMessageContent::ContentPartList(vec![
                ChatMessageContentPart::Text(ChatMessageText {
                    text: "System prompt".to_string(),
                }),
                ChatMessageContentPart::ImageUrl(ChatMessageImageUrl {
                    url: "https://example.com/image.jpg".to_string(),
                    detail: None,
                }),
            ]),
            tool_call_id: None,
        };

        // Should succeed in LangChain (unlike OpenAI which would fail)
        let langchain_message = message_to_langchain_format(message).unwrap();
        let content_array = langchain_message["content"].as_array().unwrap();
        assert_eq!(content_array.len(), 2);
        assert_eq!(content_array[0]["type"], "text");
        assert_eq!(content_array[1]["type"], "image");
        assert_eq!(content_array[1]["source_type"], "url");
        assert_eq!(content_array[1]["url"], "https://example.com/image.jpg");
    }
}
