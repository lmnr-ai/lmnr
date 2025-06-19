use serde::Serialize;
use std::collections::HashMap;

use crate::db::spans::{Span, SpanType};

use super::openai::OpenAIChatMessageContentPartImageUrl;

#[derive(Serialize)]
struct LangChainChatMessageContentPartText {
    text: String,
}

#[derive(Serialize)]
struct LangChainChatMessageContentPartImageOrFileBase64 {
    data: String,
    mime_type: String,
}

#[derive(Serialize)]
struct LangChainChatMessageContentPartImageOrFileUrl {
    url: String,
}

#[derive(Serialize)]
#[serde(tag = "source_type", rename_all = "snake_case")]
enum LangChainChatMessageContentPartImage {
    #[serde(rename = "base64")]
    Base64(LangChainChatMessageContentPartImageOrFileBase64),
    Url(LangChainChatMessageContentPartImageOrFileUrl),
}

#[derive(Serialize)]
#[serde(tag = "source_type", rename_all = "snake_case")]
enum LangChainChatMessageContentPartFile {
    #[serde(rename = "base64")]
    Base64(LangChainChatMessageContentPartImageOrFileBase64),
    Url(LangChainChatMessageContentPartImageOrFileUrl),
}

#[derive(Serialize)]
#[serde(tag = "source_type", rename_all = "snake_case")]
enum LangChainChatMessageContentPartAudio {
    #[serde(rename = "base64")]
    Base64(LangChainChatMessageContentPartImageOrFileBase64),
}

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum LangChainChatMessageContentPart {
    String,
    Text(String),
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
    args: HashMap<String, serde_json::Value>,
}

#[derive(Serialize)]
struct LangChainAssistantChatMessage {
    content: LangChainChatMessageContent,
    tool_calls: Vec<LangChainChatMessageToolCall>,
}

#[derive(Serialize)]
#[serde(tag = "role", rename_all = "snake_case")]
enum LangChainChatMessage {
    User(LangChainUserChatMessage),
    Assistant(LangChainAssistantChatMessage),
}

pub fn is_langchain_span(span: &Span) -> bool {
    span.span_type == SpanType::LLM
        && (span
            .attributes
            .get("lmnr.association.properties.ls_provider")
            .is_some()
            || (span.name.starts_with("Chat") && span.name.ends_with(".chat")))
}
