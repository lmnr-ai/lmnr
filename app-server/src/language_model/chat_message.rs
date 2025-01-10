use std::sync::Arc;

use anyhow::Result;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::storage::Storage;

use super::providers::openai::OpenAIImageUrl;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatMessageText {
    pub text: String,
}

/// Chat message image url
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessageImageUrl {
    pub url: String,
    #[serde(default)]
    pub detail: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessageImage {
    pub media_type: String, // e.g. "image/jpeg"
    pub data: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatMessageDocumentSource {
    #[serde(rename = "type")]
    pub document_type: String, // "base64"
    pub media_type: String, // e.g. "application/pdf"
    pub data: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatMessageDocumentUrl {
    pub media_type: String, // e.g. "application/pdf"
    pub url: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessageDocument {
    pub source: ChatMessageDocumentSource,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "type")]
pub enum ChatMessageContentPart {
    #[serde(rename = "text")]
    Text(ChatMessageText),
    #[serde(rename = "image_url")]
    ImageUrl(ChatMessageImageUrl),
    #[serde(rename = "image")]
    Image(ChatMessageImage),
    #[serde(rename = "document")]
    Document(ChatMessageDocument),
    #[serde(rename = "document_url")]
    DocumentUrl(ChatMessageDocumentUrl),
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(untagged)]
pub enum ChatMessageContent {
    Text(String),
    ContentPartList(Vec<ChatMessageContentPart>),
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatMessage {
    pub role: String,
    pub content: ChatMessageContent,
}

#[derive(Debug, Deserialize)]
pub struct ChatChoice {
    message: ChatMessage,
}

impl ChatChoice {
    pub fn new(message: ChatMessage) -> Self {
        Self { message }
    }
}

#[derive(Debug, Deserialize)]
pub struct ChatCompletion {
    pub choices: Vec<ChatChoice>,
    pub usage: ChatUsage,
    pub model: String,
}

impl ChatCompletion {
    pub fn new(choices: Vec<ChatChoice>, usage: ChatUsage, model: String) -> Self {
        Self {
            choices,
            usage,
            model,
        }
    }

    pub fn text_message(&self) -> String {
        let chat_message = &self.choices.first().unwrap().message;
        match &chat_message.content {
            ChatMessageContent::Text(ref text) => text.clone(),
            ChatMessageContent::ContentPartList(parts) => parts
                .iter()
                .map(|part| match part {
                    ChatMessageContentPart::Text(text) => text.text.clone(),
                    _ => {
                        log::error!("LLM returned an image");
                        String::from("\n\n <Image></Image> \n\n")
                    }
                })
                .collect::<Vec<String>>()
                .join(""),
        }
    }

    pub fn usage(&self) -> ChatUsage {
        self.usage.clone()
    }

    pub fn model(&self) -> String {
        self.model.clone()
    }
}

#[derive(Clone, Debug, Deserialize, Default)]
pub struct ChatUsage {
    pub completion_tokens: u32,
    pub prompt_tokens: u32,
    pub total_tokens: u32,
    #[serde(default)]
    pub approximate_cost: Option<f64>,
}

#[derive(Deserialize)]
pub struct InstrumentationChatMessageImageSource {
    media_type: String,
    data: String,
}

#[derive(Deserialize)]
pub struct InstrumentationChatMessageImage {
    source: InstrumentationChatMessageImageSource,
}

#[derive(Deserialize)]
#[serde(untagged)]
pub enum InstrumentationChatMessageImageUrl {
    // TODO: Add support for other providers
    OpenAIImageUrl(OpenAIImageUrl),
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct InstrumentationChatMessageDocumentBase64 {
    pub media_type: String, // e.g. "application/pdf"
    pub data: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "type")]
pub enum InstrumentationChatMessageDocumentSource {
    #[serde(rename = "base64")]
    Base64(InstrumentationChatMessageDocumentBase64),
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InstrumentationChatMessageDocument {
    pub source: InstrumentationChatMessageDocumentSource,
}

/// Struct to decode any kind of chat message content part from automatic instrumentation by OpenLLMetry
///
/// ImageUrl contains different kinds of imageurls generated by autoinstrumentation.
#[derive(Deserialize)]
#[serde(tag = "type")]
pub enum InstrumentationChatMessageContentPart {
    #[serde(rename = "text")]
    Text(ChatMessageText),
    #[serde(rename = "image_url")]
    ImageUrl(InstrumentationChatMessageImageUrl),
    #[serde(rename = "image")]
    Image(InstrumentationChatMessageImage),
    #[serde(rename = "document")]
    Document(InstrumentationChatMessageDocument),
}

impl ChatMessageContentPart {
    pub fn from_instrumentation_content_part(
        part: InstrumentationChatMessageContentPart,
    ) -> ChatMessageContentPart {
        match part {
            InstrumentationChatMessageContentPart::Text(text) => ChatMessageContentPart::Text(text),
            InstrumentationChatMessageContentPart::ImageUrl(image_url) => match image_url {
                InstrumentationChatMessageImageUrl::OpenAIImageUrl(image_url) => {
                    ChatMessageContentPart::ImageUrl(ChatMessageImageUrl {
                        url: image_url.image_url.url,
                        detail: image_url.image_url.detail,
                    })
                }
            },
            InstrumentationChatMessageContentPart::Image(image) => {
                ChatMessageContentPart::Image(ChatMessageImage {
                    media_type: image.source.media_type,
                    data: image.source.data,
                })
            }
            InstrumentationChatMessageContentPart::Document(document) => match document.source {
                InstrumentationChatMessageDocumentSource::Base64(document_source) => {
                    ChatMessageContentPart::Document(ChatMessageDocument {
                        source: ChatMessageDocumentSource {
                            document_type: "base64".to_string(),
                            media_type: document_source.media_type,
                            data: document_source.data,
                        },
                    })
                }
            },
        }
    }

    /// Store the media in the storage and replace the media with the url
    /// returning the modified `ChatMessageContentPart`.
    /// For `Image`, we replace the content with `ImageUrl`
    pub async fn store_media<S: Storage + ?Sized>(
        &self,
        project_id: &Uuid,
        storage: Arc<S>,
    ) -> Result<ChatMessageContentPart> {
        match self {
            ChatMessageContentPart::Image(image) => {
                let key = crate::storage::create_key(project_id, &None);
                let data = crate::storage::base64_to_bytes(&image.data)?;
                let url = storage.store(data, &key).await?;
                Ok(ChatMessageContentPart::ImageUrl(ChatMessageImageUrl {
                    url,
                    detail: Some(format!("media_type:{};base64", image.media_type)),
                }))
            }
            ChatMessageContentPart::Document(document) => {
                let file_extension = if &document.source.media_type == "application/pdf" {
                    Some("pdf".to_string())
                } else {
                    None
                };
                let key = crate::storage::create_key(project_id, &file_extension);
                let data = crate::storage::base64_to_bytes(&document.source.data)?;
                let url = storage.store(data, &key).await?;
                Ok(ChatMessageContentPart::DocumentUrl(
                    ChatMessageDocumentUrl {
                        media_type: document.source.media_type.clone(),
                        url,
                    },
                ))
            }
            _ => Ok(self.clone()),
        }
    }
}
