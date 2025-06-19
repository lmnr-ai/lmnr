use indexmap::IndexMap;
use serde::Serialize;
use serde_json::Value;

use crate::{
    db::spans::{Span, SpanType},
    language_model::{ChatMessage, ChatMessageContent, ChatMessageContentPart},
};

use super::openai::{
    OpenAIChatMessageContentPartImageUrl, OpenAIChatMessageContentPartImageUrlInner,
};

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
    Base64(LangChainChatMessageContentPartImageOrFileBase64),
}

#[derive(Serialize, Debug)]
#[serde(tag = "type", rename_all = "snake_case")]
enum LangChainChatMessageContentPart {
    String,
    Text(LangChainChatMessageContentPartText),
    ImageUrl(OpenAIChatMessageContentPartImageUrl),
    Image(LangChainChatMessageContentPartImage),
    File(LangChainChatMessageContentPartFile),
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
    args: IndexMap<String, serde_json::Value>,
    #[serde(rename = "type")]
    block_type: String, // always "tool_call"
}

#[derive(Serialize)]
struct LangChainAssistantChatMessage {
    content: LangChainChatMessageContent,
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

    if let Some(input_messages) = span_input {
        let input_messages = input_messages
            .into_iter()
            .map(|message| message_to_langchain_format(message))
            .collect::<Vec<Value>>();
        span.input = Some(Value::Array(input_messages));
    }

    if let Some(output_messages) = span_output {
        let output_messages = output_messages
            .into_iter()
            .map(|message| message_to_langchain_format(message))
            .collect::<Vec<Value>>();
        span.output = Some(Value::Array(output_messages));
    }
}

fn message_to_langchain_format(message: ChatMessage) -> Value {
    let role = message.role.clone();
    let tool_calls = if let ChatMessageContent::ContentPartList(parts) = &message.content {
        tool_calls_from_content_parts(parts)
    } else {
        Vec::new()
    };
    let content = if message.role == "tool" {
        LangChainChatMessageContent::Text("".to_string())
    } else {
        match message.content {
            ChatMessageContent::Text(text) => LangChainChatMessageContent::Text(text.clone()),
            ChatMessageContent::ContentPartList(parts) => LangChainChatMessageContent::ContentPartList(
                parts
                    .into_iter()
                    .filter_map(|v| {
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
                    .collect(),
            ),
        }
    };
    let langchain_message = match role.as_str() {
        "user" => LangChainChatMessage::User(LangChainUserChatMessage { content }),
        "assistant" => LangChainChatMessage::Assistant(LangChainAssistantChatMessage {
            content,
            tool_calls,
        }),
        "system" => LangChainChatMessage::System(LangChainSystemChatMessage { content }),
        _ => LangChainChatMessage::Tool(LangChainToolChatMessage {
            content: Value::Null,
            tool_call_id: message.tool_call_id.clone().unwrap_or_default(),
        }),
    };
    serde_json::to_value(langchain_message).unwrap()
}

fn tool_calls_from_content_parts(
    content_parts: &Vec<ChatMessageContentPart>,
) -> Vec<LangChainChatMessageToolCall> {
    content_parts
        .into_iter()
        .filter_map(|v| match v {
            ChatMessageContentPart::ToolCall(tool_call) => {
                let args = match tool_call.arguments.clone() {
                    Some(Value::String(s)) => {
                        serde_json::from_str::<IndexMap<String, Value>>(&s).unwrap()
                    }
                    Some(Value::Object(o)) => o.into_iter().collect(),
                    _ => IndexMap::new(),
                };
                Some(LangChainChatMessageToolCall {
                    id: tool_call.id.clone().unwrap_or_default(),
                    name: tool_call.name.clone(),
                    args,
                    block_type: "tool_call".to_string(),
                })
            }
            _ => None,
        })
        .collect()
}

/// Ok(Some(T)) - Success, return the OpenAI message content part
/// Ok(None) - Skip, do not include in the OpenAI message, expected, e.g. tool calls inside
///            content parts.
/// Err(E) - Error, do not include in the OpenAI message, but log the error
impl TryInto<Option<LangChainChatMessageContentPart>> for ChatMessageContentPart {
    type Error = anyhow::Error;

    fn try_into(self) -> Result<Option<LangChainChatMessageContentPart>, Self::Error> {
        match self {
            ChatMessageContentPart::Text(text) => Ok(Some(LangChainChatMessageContentPart::Text(
                LangChainChatMessageContentPartText { text: text.text },
            ))),
            ChatMessageContentPart::ImageUrl(image_url) => Ok(Some(
                LangChainChatMessageContentPart::ImageUrl(OpenAIChatMessageContentPartImageUrl {
                    image_url: OpenAIChatMessageContentPartImageUrlInner {
                        url: image_url.url,
                        detail: image_url.detail,
                    },
                }),
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
    use super::*;
    use crate::language_model::{
        ChatMessageContentPart, ChatMessageDocument, ChatMessageDocumentSource,
        ChatMessageDocumentUrl, ChatMessageImage, ChatMessageImageRawBytes, ChatMessageImageUrl,
        ChatMessageText, ChatMessageToolCall,
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
        let langchain_message = message_to_langchain_format(message);

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
        let langchain_message = message_to_langchain_format(message);

        assert_eq!(langchain_message["role"], "tool");
        assert_eq!(langchain_message["content"], Value::Null); // LangChain tool messages have null content
        assert_eq!(langchain_message["tool_call_id"], "call_123");
    }

    #[test]
    fn test_assistant_role_message() {
        let message = ChatMessage {
            role: "assistant".to_string(),
            content: ChatMessageContent::Text("How can I help you?".to_string()),
            tool_call_id: None,
        };
        let langchain_message = message_to_langchain_format(message);

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
        let langchain_message = message_to_langchain_format(message);

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
        let langchain_message = message_to_langchain_format(message);

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
        let langchain_message = message_to_langchain_format(message);

        assert_eq!(langchain_message["role"], "user");
        let content_array = langchain_message["content"].as_array().unwrap();
        assert_eq!(content_array.len(), 2);

        assert_eq!(content_array[0]["type"], "text");
        assert_eq!(content_array[0]["text"], "What's in this image?");

        assert_eq!(content_array[1]["type"], "image_url");
        assert_eq!(
            content_array[1]["image_url"]["url"],
            "https://example.com/image.jpg"
        );
        assert_eq!(content_array[1]["image_url"]["detail"], "high");
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
        let langchain_message = message_to_langchain_format(message);

        let content_array = langchain_message["content"].as_array().unwrap();
        assert_eq!(content_array[0]["type"], "image_url");
        assert_eq!(
            content_array[0]["image_url"]["url"],
            "https://example.com/simple.jpg"
        );
        assert!(content_array[0]["image_url"]["detail"].is_null());
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
        let langchain_message = message_to_langchain_format(message);

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
        let langchain_message = message_to_langchain_format(message);

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
        let langchain_message = message_to_langchain_format(message);

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
        let langchain_message = message_to_langchain_format(message);

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
        let args = &tool_calls[0]["args"];
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
        let langchain_message = message_to_langchain_format(message);

        // Check tool_calls
        let tool_calls = langchain_message["tool_calls"].as_array().unwrap();
        assert_eq!(tool_calls.len(), 2);

        assert_eq!(tool_calls[0]["id"], "call_1");
        assert_eq!(tool_calls[0]["name"], "function_1");
        assert_eq!(tool_calls[0]["args"]["param"], "value1");

        assert_eq!(tool_calls[1]["id"], "call_2");
        assert_eq!(tool_calls[1]["name"], "function_2");
        assert_eq!(tool_calls[1]["args"]["param"], "value2");
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
        let langchain_message = message_to_langchain_format(message);

        let tool_calls = langchain_message["tool_calls"].as_array().unwrap();
        assert_eq!(tool_calls[0]["id"], ""); // Should default to empty string
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
        let langchain_message = message_to_langchain_format(message);

        let tool_calls = langchain_message["tool_calls"].as_array().unwrap();
        let args = &tool_calls[0]["args"];
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
        let langchain_message = message_to_langchain_format(message);

        let tool_calls = langchain_message["tool_calls"].as_array().unwrap();
        let args = &tool_calls[0]["args"];
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

        let langchain_message = message_to_langchain_format(message);

        // Check content (should exclude tool calls)
        let content_array = langchain_message["content"].as_array().unwrap();
        assert_eq!(content_array.len(), 2);
        assert_eq!(content_array[0]["type"], "text");
        assert_eq!(content_array[1]["type"], "image_url");

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

        let langchain_message = message_to_langchain_format(message);

        let content_array = langchain_message["content"].as_array().unwrap();
        assert_eq!(content_array.len(), 2);

        // First should be image_url type (OpenAI format)
        assert_eq!(content_array[0]["type"], "image_url");
        assert_eq!(
            content_array[0]["image_url"]["url"],
            "https://example.com/image.jpg"
        );

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
        let langchain_message = message_to_langchain_format(message);

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
        let langchain_message = message_to_langchain_format(message);

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

        assert_eq!(serialized["type"], "image_url");
        assert_eq!(
            serialized["image_url"]["url"],
            "https://example.com/test.jpg"
        );
        assert_eq!(serialized["image_url"]["detail"], "low");
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
        assert_eq!(input_content[1]["type"], "image_url");
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
        assert_eq!(tool_calls[0]["args"]["query"], "rust programming");
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
        let langchain_message = message_to_langchain_format(message);

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
        let langchain_message = message_to_langchain_format(message);

        let tool_calls = langchain_message["tool_calls"].as_array().unwrap();
        let tool_call_obj = &tool_calls[0];

        // Verify exact LangChain tool call structure
        assert_eq!(tool_call_obj["type"], "tool_call");
        assert!(tool_call_obj["id"].is_string());
        assert!(tool_call_obj["name"].is_string());
        assert!(tool_call_obj["args"].is_object());

        // Arguments should be object, not string like OpenAI
        assert_eq!(tool_call_obj["args"]["timezone"], "UTC");
    }

    #[test]
    fn test_is_langchain_span() {
        use crate::db::spans::SpanType;
        use indexmap::IndexMap;

        // Test with ls_provider attribute
        let span_with_provider = Span {
            span_type: SpanType::LLM,
            attributes: {
                let mut attrs = IndexMap::new();
                attrs.insert(
                    "lmnr.association.properties.ls_provider".to_string(),
                    serde_json::Value::String("openai".to_string()),
                );
                serde_json::to_value(attrs).unwrap()
            },
            ..Default::default()
        };
        assert!(is_langchain_span(&span_with_provider));

        // Test with Chat*.chat name pattern
        let span_with_chat_name = Span {
            span_type: SpanType::LLM,
            name: "ChatOpenAI.chat".to_string(),
            ..Default::default()
        };
        assert!(is_langchain_span(&span_with_chat_name));

        // Test with non-LLM span type
        let non_llm_span = Span {
            span_type: SpanType::DEFAULT,
            attributes: {
                let mut attrs = IndexMap::new();
                attrs.insert(
                    "lmnr.association.properties.ls_provider".to_string(),
                    serde_json::Value::String("openai".to_string()),
                );
                serde_json::to_value(attrs).unwrap()
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
}
