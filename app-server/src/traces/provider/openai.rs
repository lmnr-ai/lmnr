use crate::{
    db::spans::Span,
    language_model::{ChatMessage, ChatMessageContent, ChatMessageContentPart},
};
use anyhow::Result;
use serde::Serialize;
use serde_json::Value;

#[derive(Serialize, Debug)]
#[serde(rename_all = "snake_case")]
struct OpenAIChatMessageContentPartText {
    text: String,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "snake_case")]
struct OpenAIChatMessageContentPartRefusal {
    refusal: String,
}

// pub for langchain
#[derive(Serialize, Debug)]
pub struct OpenAIChatMessageContentPartImageUrlInner {
    pub url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

// pub for langchain
#[derive(Serialize, Debug)]
pub struct OpenAIChatMessageContentPartImageUrl {
    pub image_url: OpenAIChatMessageContentPartImageUrlInner,
}

#[derive(Serialize, Debug)]
struct OpenAIChatMessageContentPartFileInner {
    #[serde(skip_serializing_if = "Option::is_none")]
    file_data: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    file_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    filename: Option<String>,
}

#[derive(Serialize, Debug)]
struct OpenAIChatMessageContentPartFile {
    file: OpenAIChatMessageContentPartFileInner,
}

#[derive(Serialize, Debug)]
#[allow(dead_code)]
#[serde(rename_all = "lowercase")]
enum OpenAIChatMessageContentPartAudioInputFormat {
    Wav,
    Mp3,
}

#[derive(Serialize, Debug)]
struct OpenAIChatMessageContentPartAudioInputInner {
    data: String,
    format: OpenAIChatMessageContentPartAudioInputFormat,
}

#[derive(Serialize, Debug)]
struct OpenAIChatMessageContentPartAudioInput {
    input_audio: OpenAIChatMessageContentPartAudioInputInner,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "snake_case")]
#[serde(tag = "type")]
enum OpenAIChatMessageContentPart {
    Text(OpenAIChatMessageContentPartText),
    ImageUrl(OpenAIChatMessageContentPartImageUrl),
    File(OpenAIChatMessageContentPartFile),
    #[allow(dead_code)]
    AudioInput(OpenAIChatMessageContentPartAudioInput),
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "snake_case")]
#[serde(tag = "type")]
enum OpenAIAssistantChatMessageContentPart {
    Text(OpenAIChatMessageContentPartText),
    #[allow(dead_code)]
    Refusal(OpenAIChatMessageContentPartRefusal),
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "snake_case")]
#[serde(tag = "type")]
enum OpenAIChatMessageContentPartTextOnly {
    Text(OpenAIChatMessageContentPartText),
}

#[derive(Serialize)]
#[serde(untagged)]
enum OpenAIChatMessageContent {
    Text(String),
    ContentPartList(Vec<OpenAIChatMessageContentPart>),
}

#[derive(Serialize)]
#[serde(untagged)]
enum OpenAIChatMessageContentStringOrTextBlocks {
    Text(String),
    ContentPartList(Vec<OpenAIChatMessageContentPartTextOnly>),
}

#[derive(Serialize)]
#[serde(untagged)]
enum OpenAIAssistantChatMessageContent {
    Text(String),
    ContentPartList(Vec<OpenAIAssistantChatMessageContentPart>),
}

#[derive(Serialize)]
struct OpenAIChatMessageToolCallFunctionInner {
    name: String,
    arguments: String,
}

#[derive(Serialize)]
struct OpenAIChatMessageToolCallFunction {
    id: String,
    function: OpenAIChatMessageToolCallFunctionInner,
}

#[derive(Serialize)]
#[serde(tag = "type")]
#[serde(rename_all = "snake_case")]
enum OpenAIChatMessageToolCall {
    Function(OpenAIChatMessageToolCallFunction),
}

#[derive(Serialize)]
struct OpenAIUserChatMessage {
    content: OpenAIChatMessageContent,
}

#[derive(Serialize)]
struct OpenAIDeveloperChatMessage {
    content: OpenAIChatMessageContentStringOrTextBlocks,
}

#[derive(Serialize)]
struct OpenAISystemChatMessage {
    content: OpenAIChatMessageContentStringOrTextBlocks,
}

#[derive(Serialize)]
struct OpenAIAssistantChatMessage {
    content: OpenAIAssistantChatMessageContent,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_calls: Option<Vec<OpenAIChatMessageToolCall>>,
}

#[derive(Serialize)]
struct OpenAIToolChatMessage {
    content: OpenAIChatMessageContentStringOrTextBlocks,
    tool_call_id: String,
}

#[derive(Serialize)]
#[serde(tag = "role", rename_all = "snake_case")]
enum OpenAIChatMessage {
    Developer(OpenAIDeveloperChatMessage),
    User(OpenAIUserChatMessage),
    System(OpenAISystemChatMessage),
    Assistant(OpenAIAssistantChatMessage),
    Tool(OpenAIToolChatMessage),
}

pub fn convert_span_to_openai(span: &mut Span) {
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
            .map(|message| message_to_openai_format(message))
            .collect::<Result<Vec<Value>>>()
            .map_err(|e| log::warn!("Error converting chat message to OpenAI format: {}", e))
            .ok()
    });

    let converted_output_messages = span_output.and_then(|output_messages| {
        output_messages
            .into_iter()
            .map(|message| message_to_openai_format(message))
            .collect::<Result<Vec<Value>>>()
            .map_err(|e| log::warn!("Error converting chat message to OpenAI format: {}", e))
            .ok()
    });

    // only update the span if we are successful in parsing the messages in
    // both input and output
    if converted_input_messages.is_some() && converted_output_messages.is_some() {
        span.input = Some(Value::Array(converted_input_messages.unwrap()));
        span.output = Some(Value::Array(converted_output_messages.unwrap()));
    }
}

fn message_to_openai_format(message: ChatMessage) -> Result<Value> {
    let openai_message = match message.role.trim().to_lowercase().as_str() {
        "user" => convert_user_message(message)?,
        "system" => convert_system_message(message)?,
        "assistant" => convert_assistant_message(message)?,
        "tool" => convert_tool_message(message)?,
        "developer" => convert_developer_message(message)?,
        _ => return Err(anyhow::anyhow!("Invalid role: {}", message.role)),
    };

    Ok(serde_json::to_value(openai_message)?)
}

fn convert_user_message(message: ChatMessage) -> Result<OpenAIChatMessage> {
    let content = convert_to_openai_user_content(message.content)?;
    Ok(OpenAIChatMessage::User(OpenAIUserChatMessage { content }))
}

fn convert_developer_message(message: ChatMessage) -> Result<OpenAIChatMessage> {
    let content = convert_to_openai_content_text_only(message.content)?;
    Ok(OpenAIChatMessage::Developer(OpenAIDeveloperChatMessage {
        content,
    }))
}

fn convert_system_message(message: ChatMessage) -> Result<OpenAIChatMessage> {
    let content = convert_to_openai_content_text_only(message.content)?;
    Ok(OpenAIChatMessage::System(OpenAISystemChatMessage {
        content,
    }))
}

fn convert_tool_message(message: ChatMessage) -> Result<OpenAIChatMessage> {
    let content = convert_to_openai_content_text_only(message.content)?;
    let tool_call_id = message
        .tool_call_id
        .ok_or(anyhow::anyhow!("Tool call ID is required"))?;
    Ok(OpenAIChatMessage::Tool(OpenAIToolChatMessage {
        content,
        tool_call_id,
    }))
}

fn convert_assistant_message(message: ChatMessage) -> Result<OpenAIChatMessage> {
    let tool_calls = if let ChatMessageContent::ContentPartList(ref parts) = message.content {
        tool_calls_from_content_parts(parts)?
    } else {
        Vec::new()
    };

    let content = convert_to_openai_assistant_content(message.content)?;

    Ok(OpenAIChatMessage::Assistant(OpenAIAssistantChatMessage {
        content,
        tool_calls: if tool_calls.is_empty() {
            None
        } else {
            Some(tool_calls)
        },
    }))
}

fn convert_to_openai_user_content(content: ChatMessageContent) -> Result<OpenAIChatMessageContent> {
    match content {
        ChatMessageContent::Text(text) => Ok(OpenAIChatMessageContent::Text(text)),
        ChatMessageContent::ContentPartList(parts) => {
            let converted_parts = parts
                .into_iter()
                .filter_map(|v| {
                    // We try to be permissive (log and skip the invalid parts) in the user message,
                    // unlike other places where we fail fast.
                    v.try_into()
                        .map_err(|e| {
                            log::warn!(
                                "Error converting chat message content part to OpenAI format: {}",
                                e
                            )
                        })
                        .ok()
                        .flatten()
                })
                .collect();
            Ok(OpenAIChatMessageContent::ContentPartList(converted_parts))
        }
    }
}

fn convert_to_openai_content_text_only(
    content: ChatMessageContent,
) -> Result<OpenAIChatMessageContentStringOrTextBlocks> {
    match content {
        ChatMessageContent::Text(text) => {
            Ok(OpenAIChatMessageContentStringOrTextBlocks::Text(text))
        }
        ChatMessageContent::ContentPartList(parts) => {
            let text_only_parts = parts
                .into_iter()
                .filter_map(|part| match part {
                    ChatMessageContentPart::Text(text) => {
                        Some(Ok(OpenAIChatMessageContentPartTextOnly::Text(
                            OpenAIChatMessageContentPartText { text: text.text },
                        )))
                    }
                    _ => Some(Err(anyhow::anyhow!(
                        "Non-text content part found in message role that only supports text"
                    ))),
                })
                .collect::<Result<Vec<_>>>()?;
            Ok(OpenAIChatMessageContentStringOrTextBlocks::ContentPartList(
                text_only_parts,
            ))
        }
    }
}

fn convert_to_openai_assistant_content(
    content: ChatMessageContent,
) -> Result<OpenAIAssistantChatMessageContent> {
    match content {
        ChatMessageContent::Text(text) => Ok(OpenAIAssistantChatMessageContent::Text(text)),
        ChatMessageContent::ContentPartList(parts) => {
            let converted_parts = parts
                .into_iter()
                .filter_map(|v| match v {
                    ChatMessageContentPart::Text(text) => {
                        Some(OpenAIAssistantChatMessageContentPart::Text(
                            OpenAIChatMessageContentPartText { text: text.text },
                        ))
                    }
                    _ => None,
                })
                .collect();
            Ok(OpenAIAssistantChatMessageContent::ContentPartList(
                converted_parts,
            ))
        }
    }
}

fn tool_calls_from_content_parts(
    content_parts: &Vec<ChatMessageContentPart>,
) -> Result<Vec<OpenAIChatMessageToolCall>> {
    content_parts
        .into_iter()
        .filter_map(|v| match v {
            ChatMessageContentPart::ToolCall(tool_call) => {
                let id = tool_call
                    .id
                    .clone()
                    .ok_or(anyhow::anyhow!("Tool call ID is required"));
                Some(id.map(|id| {
                    OpenAIChatMessageToolCall::Function(OpenAIChatMessageToolCallFunction {
                        id,
                        function: OpenAIChatMessageToolCallFunctionInner {
                            name: tool_call.name.clone(),
                            arguments: serde_json::to_string(&tool_call.arguments).unwrap(),
                        },
                    })
                }))
            }
            _ => None,
        })
        .collect()
}

/// Ok(Some(T)) - Success, return the OpenAI message content part
/// Ok(None) - Skip, do not include in the OpenAI message, expected, e.g. tool calls inside
///            content parts.
/// Err(E) - Error, do not include in the OpenAI message, but log the error
impl TryInto<Option<OpenAIChatMessageContentPart>> for ChatMessageContentPart {
    type Error = anyhow::Error;

    fn try_into(self) -> Result<Option<OpenAIChatMessageContentPart>, Self::Error> {
        match self {
            ChatMessageContentPart::Text(text) => Ok(Some(OpenAIChatMessageContentPart::Text(
                OpenAIChatMessageContentPartText { text: text.text },
            ))),
            ChatMessageContentPart::ImageUrl(image_url) => Ok(Some(
                OpenAIChatMessageContentPart::ImageUrl(OpenAIChatMessageContentPartImageUrl {
                    image_url: OpenAIChatMessageContentPartImageUrlInner {
                        url: image_url.url,
                        detail: image_url.detail,
                    },
                }),
            )),
            ChatMessageContentPart::Image(image) => Ok(Some(
                OpenAIChatMessageContentPart::ImageUrl(OpenAIChatMessageContentPartImageUrl {
                    image_url: OpenAIChatMessageContentPartImageUrlInner {
                        url: format!("data:{};base64,{}", image.media_type, image.data),
                        detail: None,
                    },
                }),
            )),
            ChatMessageContentPart::Document(document) => Ok(Some(
                OpenAIChatMessageContentPart::File(OpenAIChatMessageContentPartFile {
                    file: OpenAIChatMessageContentPartFileInner {
                        file_data: Some(document.source.data),
                        file_id: None,
                        filename: None,
                    },
                }),
            )),
            ChatMessageContentPart::DocumentUrl(_) => {
                Err(anyhow::anyhow!("Document URL is not supported in OpenAI"))
            }
            ChatMessageContentPart::ToolCall(_) => Ok(None),
            ChatMessageContentPart::ImageRawBytes(_) => Err(anyhow::anyhow!(
                "Image raw bytes is not supported in OpenAI"
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
        let openai_message = message_to_openai_format(message).unwrap();

        assert_eq!(openai_message["role"], "user");
        assert_eq!(openai_message["content"], "Hello, world!");
        assert!(openai_message["tool_calls"].is_null());
        assert!(openai_message["tool_call_id"].is_null());
    }

    #[test]
    fn test_text_message_with_tool_call_id() {
        let message = ChatMessage {
            role: "tool".to_string(),
            content: ChatMessageContent::Text("Tool response".to_string()),
            tool_call_id: Some("call_123".to_string()),
        };
        let openai_message = message_to_openai_format(message).unwrap();

        assert_eq!(openai_message["role"], "tool");
        assert_eq!(openai_message["content"], "Tool response");
        assert_eq!(openai_message["tool_call_id"], "call_123");
    }

    #[test]
    fn test_assistant_role_message() {
        let message = ChatMessage {
            role: "assistant".to_string(),
            content: ChatMessageContent::Text("How can I help you?".to_string()),
            tool_call_id: None,
        };
        let openai_message = message_to_openai_format(message).unwrap();

        assert_eq!(openai_message["role"], "assistant");
        assert_eq!(openai_message["content"], "How can I help you?");
    }

    #[test]
    fn test_system_role_message() {
        let message = ChatMessage {
            role: "system".to_string(),
            content: ChatMessageContent::Text("You are a helpful assistant.".to_string()),
            tool_call_id: None,
        };
        let openai_message = message_to_openai_format(message).unwrap();

        assert_eq!(openai_message["role"], "system");
        assert_eq!(openai_message["content"], "You are a helpful assistant.");
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
        let openai_message = message_to_openai_format(message).unwrap();

        assert_eq!(openai_message["role"], "user");
        assert!(openai_message["content"].is_array());
        let content_array = openai_message["content"].as_array().unwrap();
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
        let openai_message = message_to_openai_format(message).unwrap();

        assert_eq!(openai_message["role"], "user");
        let content_array = openai_message["content"].as_array().unwrap();
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
        let openai_message = message_to_openai_format(message).unwrap();

        let content_array = openai_message["content"].as_array().unwrap();
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
        let openai_message = message_to_openai_format(message).unwrap();

        let content_array = openai_message["content"].as_array().unwrap();
        assert_eq!(content_array[0]["type"], "image_url");
        assert_eq!(
            content_array[0]["image_url"]["url"],
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="
        );
        assert!(content_array[0]["image_url"]["detail"].is_null());
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
        let openai_message = message_to_openai_format(message).unwrap();

        let content_array = openai_message["content"].as_array().unwrap();
        assert_eq!(content_array[0]["type"], "file");
        assert_eq!(content_array[0]["file"]["file_data"], "SGVsbG8gV29ybGQ=");
        assert!(content_array[0]["file"]["file_id"].is_null());
        assert!(content_array[0]["file"]["filename"].is_null());
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
        let openai_message = message_to_openai_format(message).unwrap();

        assert_eq!(openai_message["role"], "assistant");

        // Check content (should only include text, not tool calls)
        let content_array = openai_message["content"].as_array().unwrap();
        assert_eq!(content_array.len(), 1);
        assert_eq!(content_array[0]["type"], "text");
        assert_eq!(
            content_array[0]["text"],
            "Let me check the weather for you."
        );

        // Check tool_calls
        let tool_calls = openai_message["tool_calls"].as_array().unwrap();
        assert_eq!(tool_calls.len(), 1);
        assert_eq!(tool_calls[0]["type"], "function");
        assert_eq!(tool_calls[0]["id"], "call_abc123");
        assert_eq!(tool_calls[0]["function"]["name"], "get_weather");
        assert_eq!(
            tool_calls[0]["function"]["arguments"],
            "{\"location\":\"San Francisco\",\"unit\":\"celsius\"}"
        );
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
        let openai_message = message_to_openai_format(message).unwrap();

        // Check tool_calls
        let tool_calls = openai_message["tool_calls"].as_array().unwrap();
        assert_eq!(tool_calls.len(), 2);

        assert_eq!(tool_calls[0]["id"], "call_1");
        assert_eq!(tool_calls[0]["function"]["name"], "function_1");
        assert_eq!(
            tool_calls[0]["function"]["arguments"],
            "{\"param\":\"value1\"}"
        );

        assert_eq!(tool_calls[1]["id"], "call_2");
        assert_eq!(tool_calls[1]["function"]["name"], "function_2");
        assert_eq!(
            tool_calls[1]["function"]["arguments"],
            "{\"param\":\"value2\"}"
        );
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

        // Should return an error because tool call ID is required
        let result = message_to_openai_format(message);
        assert!(result.is_err());
        assert!(
            result
                .unwrap_err()
                .to_string()
                .contains("Tool call ID is required")
        );
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
        let openai_message = message_to_openai_format(message).unwrap();

        let tool_calls = openai_message["tool_calls"].as_array().unwrap();
        let arguments_str = tool_calls[0]["function"]["arguments"].as_str().unwrap();
        let parsed_args: Value = serde_json::from_str(arguments_str).unwrap();
        assert_eq!(parsed_args, complex_args);
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

        let openai_message = message_to_openai_format(message).unwrap();

        // Check content (assistant messages only include text parts, not images)
        let content_array = openai_message["content"].as_array().unwrap();
        assert_eq!(content_array.len(), 1); // Only text part, images are filtered out for assistant
        assert_eq!(content_array[0]["type"], "text");
        assert_eq!(content_array[0]["text"], "I'll analyze this image for you.");

        // Check tool_calls
        let tool_calls = openai_message["tool_calls"].as_array().unwrap();
        assert_eq!(tool_calls.len(), 1);
        assert_eq!(tool_calls[0]["function"]["name"], "analyze_image");
    }

    #[test]
    fn test_mixed_content_user_message_with_text_and_image() {
        // Test user message which should include both text and image content
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

        let openai_message = message_to_openai_format(message).unwrap();

        // Check content (user messages can include both text and images)
        let content_array = openai_message["content"].as_array().unwrap();
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

    // Error handling and edge cases
    #[test]
    fn test_empty_content_part_list() {
        let message = ChatMessage {
            role: "user".to_string(),
            content: ChatMessageContent::ContentPartList(vec![]),
            tool_call_id: None,
        };
        let openai_message = message_to_openai_format(message).unwrap();

        assert!(openai_message["content"].is_array());
        let content_array = openai_message["content"].as_array().unwrap();
        assert_eq!(content_array.len(), 0);
        assert!(openai_message["tool_calls"].is_null());
    }

    #[test]
    fn test_empty_text_message() {
        let message = ChatMessage {
            role: "user".to_string(),
            content: ChatMessageContent::Text("".to_string()),
            tool_call_id: None,
        };
        let openai_message = message_to_openai_format(message).unwrap();

        assert_eq!(openai_message["content"], "");
    }

    #[test]
    fn test_content_part_conversion_text() {
        let part = ChatMessageContentPart::Text(ChatMessageText {
            text: "Hello".to_string(),
        });
        let openai_part: Option<OpenAIChatMessageContentPart> = part.try_into().unwrap();
        let openai_part = openai_part.unwrap();
        let serialized = serde_json::to_value(openai_part).unwrap();

        assert_eq!(serialized["type"], "text");
        assert_eq!(serialized["text"], "Hello");
    }

    #[test]
    fn test_content_part_conversion_image_url() {
        let part = ChatMessageContentPart::ImageUrl(ChatMessageImageUrl {
            url: "https://example.com/test.jpg".to_string(),
            detail: Some("low".to_string()),
        });
        let openai_part: Option<OpenAIChatMessageContentPart> = part.try_into().unwrap();
        let openai_part = openai_part.unwrap();
        let serialized = serde_json::to_value(openai_part).unwrap();

        assert_eq!(serialized["type"], "image_url");
        assert_eq!(
            serialized["image_url"]["url"],
            "https://example.com/test.jpg"
        );
        assert_eq!(serialized["image_url"]["detail"], "low");
    }

    #[test]
    fn test_content_part_conversion_document_url_error() {
        let part = ChatMessageContentPart::DocumentUrl(ChatMessageDocumentUrl {
            url: "https://example.com/doc.pdf".to_string(),
            media_type: "application/pdf".to_string(),
        });
        let result: Result<Option<OpenAIChatMessageContentPart>, _> = part.try_into();
        assert!(result.is_err());
        assert!(
            result
                .unwrap_err()
                .to_string()
                .contains("Document URL is not supported")
        );
    }

    #[test]
    fn test_content_part_conversion_tool_call_error() {
        let part = ChatMessageContentPart::ToolCall(ChatMessageToolCall {
            id: Some("test".to_string()),
            name: "test".to_string(),
            arguments: Some(json!({})),
        });
        let result: Option<OpenAIChatMessageContentPart> = part.try_into().unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn test_content_part_conversion_image_raw_bytes_error() {
        let part = ChatMessageContentPart::ImageRawBytes(ChatMessageImageRawBytes {
            image: vec![1, 2, 3, 4],
            mime_type: Some("image/png".to_string()),
        });
        let result: Result<Option<OpenAIChatMessageContentPart>, _> = part.try_into();
        assert!(result.is_err());
        assert!(
            result
                .unwrap_err()
                .to_string()
                .contains("Image raw bytes is not supported")
        );
    }

    // Span conversion tests
    #[test]
    fn test_convert_span_to_openai_with_input_and_output() {
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

        convert_span_to_openai(&mut span);

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
    }

    #[test]
    fn test_convert_span_to_openai_with_input_only() {
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

        convert_span_to_openai(&mut span);

        let input_array = span.input.as_ref().unwrap().as_array().unwrap();
        assert_eq!(input_array.len(), 2);
        assert_eq!(input_array[0]["role"], "system");
        assert_eq!(input_array[1]["role"], "user");
        assert!(span.output.is_none());
    }

    #[test]
    fn test_convert_span_to_openai_with_no_messages() {
        let mut span = Span {
            input: None,
            output: None,
            ..Default::default()
        };

        convert_span_to_openai(&mut span);

        assert!(span.input.is_none());
        assert!(span.output.is_none());
    }

    #[test]
    fn test_convert_span_to_openai_with_invalid_input() {
        let mut span = Span {
            input: Some(json!({"invalid": "data"})),
            output: Some(json!("not an array")),
            ..Default::default()
        };

        convert_span_to_openai(&mut span);

        // Should remain unchanged when conversion fails
        assert_eq!(span.input.unwrap(), json!({"invalid": "data"}));
        assert_eq!(span.output.unwrap(), json!("not an array"));
    }

    #[test]
    fn test_convert_span_to_openai_with_complex_messages() {
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

        convert_span_to_openai(&mut span);

        // Check complex input conversion
        let input_array = span.input.as_ref().unwrap().as_array().unwrap();
        assert_eq!(input_array.len(), 1);
        let input_content = input_array[0]["content"].as_array().unwrap();
        assert_eq!(input_content.len(), 2);
        assert_eq!(input_content[0]["type"], "text");
        assert_eq!(input_content[1]["type"], "image_url");

        // Check complex output conversion with tool calls
        let output_array = span.output.as_ref().unwrap().as_array().unwrap();
        assert_eq!(output_array.len(), 1);
        let output_content = output_array[0]["content"].as_array().unwrap();
        assert_eq!(output_content.len(), 1); // Tool calls filtered out of content
        assert_eq!(output_content[0]["type"], "text");

        let tool_calls = output_array[0]["tool_calls"].as_array().unwrap();
        assert_eq!(tool_calls.len(), 1);
        assert_eq!(tool_calls[0]["function"]["name"], "search");
    }

    // Serialization format tests
    #[test]
    fn test_openai_message_serialization_format() {
        let message = ChatMessage {
            role: "tool".to_string(),
            content: ChatMessageContent::ContentPartList(vec![ChatMessageContentPart::Text(
                ChatMessageText {
                    text: "Hello".to_string(),
                },
            )]),
            tool_call_id: Some("call_123".to_string()),
        };
        let openai_message = message_to_openai_format(message).unwrap();

        // Verify the exact structure matches OpenAI API expectations
        assert!(openai_message.is_object());
        assert!(openai_message["role"].is_string());
        assert!(openai_message["content"].is_array());
        assert!(openai_message["tool_call_id"].is_string());
        assert!(openai_message["tool_calls"].is_null()); // No tool calls in this message
    }

    #[test]
    fn test_openai_tool_call_serialization_format() {
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
        let openai_message = message_to_openai_format(message).unwrap();

        let tool_calls = openai_message["tool_calls"].as_array().unwrap();
        let tool_call_obj = &tool_calls[0];

        // Verify exact OpenAI tool call structure
        assert_eq!(tool_call_obj["type"], "function");
        assert!(tool_call_obj["id"].is_string());
        assert!(tool_call_obj["function"].is_object());
        assert!(tool_call_obj["function"]["name"].is_string());
        assert!(tool_call_obj["function"]["arguments"].is_string());

        // Arguments should be JSON string, not object
        let args_str = tool_call_obj["function"]["arguments"].as_str().unwrap();
        let _: Value = serde_json::from_str(args_str).unwrap(); // Should parse as valid JSON
    }

    // Error path tests
    #[test]
    fn test_developer_message_with_non_text_content_error() {
        let message = ChatMessage {
            role: "developer".to_string(),
            content: ChatMessageContent::ContentPartList(vec![
                ChatMessageContentPart::Text(ChatMessageText {
                    text: "Text part".to_string(),
                }),
                ChatMessageContentPart::ImageUrl(ChatMessageImageUrl {
                    url: "https://example.com/image.jpg".to_string(),
                    detail: None,
                }),
            ]),
            tool_call_id: None,
        };

        let result = message_to_openai_format(message);
        assert!(result.is_err());
        assert!(
            result
                .unwrap_err()
                .to_string()
                .contains("Non-text content part found")
        );
    }

    #[test]
    fn test_system_message_with_non_text_content_error() {
        let message = ChatMessage {
            role: "system".to_string(),
            content: ChatMessageContent::ContentPartList(vec![
                ChatMessageContentPart::Text(ChatMessageText {
                    text: "System message".to_string(),
                }),
                ChatMessageContentPart::Document(ChatMessageDocument {
                    source: ChatMessageDocumentSource {
                        document_type: "base64".to_string(),
                        data: "data".to_string(),
                        media_type: "text/plain".to_string(),
                    },
                }),
            ]),
            tool_call_id: None,
        };

        let result = message_to_openai_format(message);
        assert!(result.is_err());
        assert!(
            result
                .unwrap_err()
                .to_string()
                .contains("Non-text content part found")
        );
    }

    #[test]
    fn test_tool_message_without_tool_call_id_error() {
        let message = ChatMessage {
            role: "tool".to_string(),
            content: ChatMessageContent::Text("Tool response".to_string()),
            tool_call_id: None, // Missing required tool_call_id
        };

        let result = message_to_openai_format(message);
        assert!(result.is_err());
        assert!(
            result
                .unwrap_err()
                .to_string()
                .contains("Tool call ID is required")
        );
    }

    #[test]
    fn test_assistant_tool_call_without_id_error() {
        let tool_call = ChatMessageToolCall {
            id: None, // Missing required ID
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

        let result = message_to_openai_format(message);
        assert!(result.is_err());
        assert!(
            result
                .unwrap_err()
                .to_string()
                .contains("Tool call ID is required")
        );
    }

    #[test]
    fn test_invalid_role_error() {
        let message = ChatMessage {
            role: "invalid_role".to_string(),
            content: ChatMessageContent::Text("Test".to_string()),
            tool_call_id: None,
        };

        let result = message_to_openai_format(message);
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
        // non-text content part in developer message
        let invalid_input_messages = vec![ChatMessage {
            role: "developer".to_string(),
            content: ChatMessageContent::ContentPartList(vec![ChatMessageContentPart::ImageUrl(
                ChatMessageImageUrl {
                    url: "https://example.com/image.jpg".to_string(),
                    detail: None,
                },
            )]),
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

        convert_span_to_openai(&mut span);

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
            role: "tool".to_string(),
            content: ChatMessageContent::Text("Tool response".to_string()),
            tool_call_id: None, // Missing required tool_call_id
        }];

        let original_input = serde_json::to_value(&valid_input_messages).unwrap();
        let original_output = serde_json::to_value(&invalid_output_messages).unwrap();

        let mut span = Span {
            input: Some(original_input.clone()),
            output: Some(original_output.clone()),
            ..Default::default()
        };

        convert_span_to_openai(&mut span);

        // Span should remain unchanged because output conversion failed
        assert_eq!(span.input.as_ref().unwrap(), &original_input);
        assert_eq!(span.output.as_ref().unwrap(), &original_output);
    }

    #[test]
    fn test_span_remains_intact_on_both_conversion_errors() {
        let invalid_input_messages = vec![ChatMessage {
            role: "system".to_string(),
            content: ChatMessageContent::ContentPartList(vec![ChatMessageContentPart::Document(
                ChatMessageDocument {
                    source: ChatMessageDocumentSource {
                        document_type: "base64".to_string(),
                        data: "data".to_string(),
                        media_type: "text/plain".to_string(),
                    },
                },
            )]),
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

        convert_span_to_openai(&mut span);

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
            role: "assistant".to_string(),
            content: ChatMessageContent::ContentPartList(vec![ChatMessageContentPart::ToolCall(
                ChatMessageToolCall {
                    id: None, // Missing required ID
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

        convert_span_to_openai(&mut span);

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
            // developer message with non-text content part
            ChatMessage {
                role: "developer".to_string(),
                content: ChatMessageContent::ContentPartList(vec![
                    ChatMessageContentPart::ImageUrl(ChatMessageImageUrl {
                        url: "https://example.com/image.jpg".to_string(),
                        detail: None,
                    }),
                ]),
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

        convert_span_to_openai(&mut span);

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

        convert_span_to_openai(&mut span);

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
                ChatMessageContentPart::DocumentUrl(ChatMessageDocumentUrl {
                    url: "https://example.com/doc.pdf".to_string(),
                    media_type: "application/pdf".to_string(),
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
        let openai_message = message_to_openai_format(message).unwrap();
        let content_array = openai_message["content"].as_array().unwrap();

        // Should only contain the two text parts, unsupported parts should be filtered out
        assert_eq!(content_array.len(), 2);
        assert_eq!(content_array[0]["type"], "text");
        assert_eq!(content_array[0]["text"], "Valid text");
        assert_eq!(content_array[1]["type"], "text");
        assert_eq!(content_array[1]["text"], "Another valid text");
    }
}
