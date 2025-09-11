use std::{
    collections::HashMap,
    sync::{Arc, LazyLock},
};

use anyhow::Result;
use regex::Regex;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    mq::utils::mq_max_payload,
    storage::{Storage, StorageTrait},
    utils::is_url,
};

static DATA_URL_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^data:((?:application|image)/[a-zA-Z-]+);base64,.*$").unwrap());

#[derive(Deserialize)]
pub struct ImageUrl {
    pub url: String,
    #[serde(default)]
    pub detail: Option<String>,
}

#[derive(Deserialize)]
pub struct OpenAIImageUrl {
    pub image_url: ImageUrl,
}

#[derive(Deserialize)]
pub struct AnthropicImageUrl {
    pub source: ImageUrl,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatMessageText {
    // FIXME: remove aliases when we are fully ready to parse
    // OpenAI Responses API formats strongly typed.
    #[serde(alias = "input_text", alias = "output_text")]
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

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessageAISDKV2File {
    #[allow(dead_code)]
    #[serde(default)]
    pub filename: Option<String>,
    pub data: String,
    pub media_type: String,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessageAISDKV1File {
    #[allow(dead_code)]
    #[serde(default)]
    pub filename: Option<String>,
    pub data: String,
    pub mime_type: String,
}

#[derive(Debug, Deserialize, Clone)]
pub struct ChatMessageOpenAIFileBase64 {
    // Filename key is an indicator for OpenAI of the payload type (vs file_id)
    // but we don't use it.
    #[allow(dead_code)]
    pub filename: String,
    pub file_data: String,
}

#[derive(Debug, Deserialize, Clone)]
pub struct ChatMessageOpenAIFileId {
    pub file_id: String,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(untagged)]
pub enum ChatMessageOpenAIFileContent {
    FileId(ChatMessageOpenAIFileId),
    Base64(ChatMessageOpenAIFileBase64),
}

#[derive(Debug, Deserialize, Clone)]
pub struct ChatMessageOpenAIFile {
    pub file: ChatMessageOpenAIFileContent,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(untagged)]
pub enum ChatMessageAISDKFile {
    V1(ChatMessageAISDKV1File),
    V2(ChatMessageAISDKV2File),
}

#[derive(Debug, Deserialize, Clone)]
#[serde(untagged)]
pub enum ChatMessageFile {
    OpenAI(ChatMessageOpenAIFile),
    AiSdk(ChatMessageAISDKFile),
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
#[serde(rename_all = "camelCase")]
pub struct ChatMessageToolCall {
    pub name: String,
    pub id: Option<String>,
    pub arguments: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessageImageRawBytes {
    pub image: Vec<u8>,
    #[serde(default)]
    pub mime_type: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessageAISDKToolResult {
    pub tool_call_id: String,
    pub output: serde_json::Value,
    pub tool_name: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "snake_case")]
#[serde(tag = "type")]
pub enum ChatMessageContentPart {
    Text(ChatMessageText),
    ImageUrl(ChatMessageImageUrl),
    Image(ChatMessageImage),
    Document(ChatMessageDocument),
    DocumentUrl(ChatMessageDocumentUrl),
    ToolCall(ChatMessageToolCall),
    #[serde(skip_serializing)]
    ImageRawBytes(ChatMessageImageRawBytes),
    // TODO: move this (and related) frontend logic
    // to provider-specific types, once we implement conversion
    // to AI SDK messages, similar to what we have for OpenAI and LangChain.
    #[serde(rename = "tool-result")]
    AISDKToolResult(ChatMessageAISDKToolResult),
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
}

#[derive(Deserialize)]
pub struct InstrumentationChatMessageImageSource {
    pub media_type: String,
    pub data: String,
}

#[derive(Deserialize)]
pub struct InstrumentationChatMessageImageWithSource {
    pub source: InstrumentationChatMessageImageSource,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessageImageAISDKRawBytes {
    pub image: Vec<u8>,
    #[serde(default)]
    pub mime_type: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessageImageAISDKImageData {
    pub image: String,
    #[serde(default)]
    pub mime_type: Option<String>,
}

#[derive(Deserialize)]
#[serde(untagged)]
pub enum InstrumentationChatMessageImage {
    WithSource(InstrumentationChatMessageImageWithSource),
    AISDKRawBytes(ChatMessageImageAISDKRawBytes),
    AISDKImageData(ChatMessageImageAISDKImageData),
    AnthropicImageUrl(AnthropicImageUrl),
}

#[derive(Deserialize)]
#[serde(untagged)]
pub enum InstrumentationChatMessageImageUrl {
    // TODO: Add support for other providers
    OpenAIImageUrl(OpenAIImageUrl),
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct InstrumentationChatMessageDocumentBase64 {
    // alias, not rename to allow for both "mediaType" and "media_type"
    #[serde(alias = "mediaType", default)]
    pub media_type: Option<String>, // e.g. "application/pdf"
    pub data: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "type")]
pub enum InstrumentationChatMessageDocumentSource {
    #[serde(rename = "base64")]
    Base64(InstrumentationChatMessageDocumentBase64),
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct InstrumentationChatMessageDocument {
    pub source: InstrumentationChatMessageDocumentSource,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InstrumentationChatMessageAISDKToolCall {
    pub tool_name: String,
    pub tool_call_id: Option<String>,
    #[serde(alias = "args")] // In AI SDK v4 it used to be called "args"
    pub input: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InstrumentationChatMessageAISDKToolResult {
    pub tool_call_id: String,
    #[serde(alias = "result")] // In AI SDK v4 it used to be called "result"
    pub output: serde_json::Value,
    pub tool_name: String,
}

/// Struct to decode any kind of chat message content part from automatic instrumentation by OpenLLMetry
///
/// ImageUrl contains different kinds of imageurls generated by autoinstrumentation.
#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum InstrumentationChatMessageContentPart {
    Text(ChatMessageText),
    ImageUrl(InstrumentationChatMessageImageUrl),
    Image(InstrumentationChatMessageImage),
    Document(InstrumentationChatMessageDocument),
    File(ChatMessageFile),
    #[serde(alias = "tool-call")]
    AISDKToolCall(InstrumentationChatMessageAISDKToolCall),
    #[serde(alias = "tool-result")]
    AISDKToolResult(InstrumentationChatMessageAISDKToolResult),
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
            InstrumentationChatMessageContentPart::Image(image) => match image {
                InstrumentationChatMessageImage::WithSource(image_source) => {
                    ChatMessageContentPart::Image(ChatMessageImage {
                        media_type: image_source.source.media_type,
                        data: image_source.source.data,
                    })
                }
                InstrumentationChatMessageImage::AISDKRawBytes(image_raw_bytes) => {
                    ChatMessageContentPart::ImageRawBytes(ChatMessageImageRawBytes {
                        image: image_raw_bytes.image,
                        mime_type: image_raw_bytes.mime_type,
                    })
                }
                InstrumentationChatMessageImage::AISDKImageData(image_data) => {
                    // Check if the image data is actually a URL
                    if is_url(&image_data.image) {
                        // If it's a URL, create an ImageUrl
                        ChatMessageContentPart::ImageUrl(ChatMessageImageUrl {
                            url: image_data.image,
                            detail: None,
                        })
                    } else {
                        // Otherwise, treat as base64 data and create an Image
                        ChatMessageContentPart::Image(ChatMessageImage {
                            data: image_data.image,
                            media_type: image_data.mime_type.unwrap_or("image/png".to_string()),
                        })
                    }
                }
                InstrumentationChatMessageImage::AnthropicImageUrl(image_url) => {
                    ChatMessageContentPart::ImageUrl(ChatMessageImageUrl {
                        url: image_url.source.url,
                        detail: image_url.source.detail,
                    })
                }
            },
            InstrumentationChatMessageContentPart::Document(document) => match document.source {
                InstrumentationChatMessageDocumentSource::Base64(document_source) => {
                    ChatMessageContentPart::Document(ChatMessageDocument {
                        source: ChatMessageDocumentSource {
                            document_type: "base64".to_string(),
                            media_type: document_source
                                .media_type
                                .unwrap_or("application/octet-stream".to_string()),
                            data: document_source.data,
                        },
                    })
                }
            },
            // TODO: remove clones as much as possible
            InstrumentationChatMessageContentPart::File(ChatMessageFile::AiSdk(file)) => {
                let media_type = match &file {
                    ChatMessageAISDKFile::V1(file) => &file.mime_type,
                    ChatMessageAISDKFile::V2(file) => &file.media_type,
                };
                let data = match &file {
                    ChatMessageAISDKFile::V1(file) => &file.data,
                    ChatMessageAISDKFile::V2(file) => &file.data,
                };
                if media_type.starts_with("image/") {
                    ChatMessageContentPart::Image(ChatMessageImage {
                        data: data.clone(),
                        media_type: media_type.clone(),
                    })
                } else {
                    ChatMessageContentPart::Document(ChatMessageDocument {
                        source: ChatMessageDocumentSource {
                            document_type: "base64".to_string(),
                            media_type: media_type.clone(),
                            data: data.clone(),
                        },
                    })
                }
            }
            InstrumentationChatMessageContentPart::File(ChatMessageFile::OpenAI(file)) => {
                match file.file {
                    // We can't download the file contents from the OpenAI storage,
                    // so just return the file id as text
                    ChatMessageOpenAIFileContent::FileId(file_id) => {
                        ChatMessageContentPart::Text(ChatMessageText {
                            text: serde_json::to_string(&HashMap::from([(
                                "file_id".to_string(),
                                file_id.file_id.clone(),
                            )]))
                            .unwrap(),
                        })
                    }
                    ChatMessageOpenAIFileContent::Base64(file_base64) => {
                        let media_type = DATA_URL_REGEX
                            .captures(&file_base64.file_data)
                            .map(|captures| captures.get(1).unwrap().as_str())
                            .unwrap_or("application/octet-stream");
                        let data = raw_base64_from_data_url(&file_base64.file_data)
                            .unwrap_or(&file_base64.file_data);
                        ChatMessageContentPart::Document(ChatMessageDocument {
                            source: ChatMessageDocumentSource {
                                document_type: "base64".to_string(),
                                media_type: media_type.to_string(),
                                data: data.to_string(),
                            },
                        })
                    }
                }
            }
            InstrumentationChatMessageContentPart::AISDKToolCall(tool_call) => {
                ChatMessageContentPart::ToolCall(ChatMessageToolCall {
                    name: tool_call.tool_name.clone(),
                    id: tool_call.tool_call_id.clone(),
                    arguments: tool_call.input.clone(),
                })
            }
            InstrumentationChatMessageContentPart::AISDKToolResult(tool_result) => {
                ChatMessageContentPart::AISDKToolResult(ChatMessageAISDKToolResult {
                    tool_call_id: tool_result.tool_call_id.clone(),
                    output: tool_result.output.clone(),
                    tool_name: tool_result.tool_name.clone(),
                })
            }
        }
    }

    /// Store the media in the storage and replace the media with the url
    /// returning the modified `ChatMessageContentPart`.
    /// For `Image`, we replace the content with `ImageUrl`
    pub async fn store_media(
        &self,
        project_id: &Uuid,
        storage: Arc<Storage>,
        bucket: &str,
    ) -> Result<ChatMessageContentPart> {
        match self {
            ChatMessageContentPart::Image(image) => {
                // Check if the data is actually a URL (not base64)
                if is_url(&image.data) {
                    // If it's already a URL, convert to ImageUrl directly
                    Ok(ChatMessageContentPart::ImageUrl(ChatMessageImageUrl {
                        url: image.data.clone(),
                        detail: Some(format!("media_type:{}", image.media_type)),
                    }))
                } else {
                    // Otherwise, treat as base64 data and store it
                    let key = crate::storage::create_key(project_id, &None);
                    let data = crate::storage::base64_to_bytes(&image.data)?;
                    let media_type = image.media_type.clone();
                    if data.len() >= mq_max_payload() {
                        log::warn!(
                            "[STORAGE] MQ payload limit exceeded (image). Project ID: [{}], payload size: [{}]",
                            project_id,
                            data.len()
                        );
                        // Leave intact in case of error
                        return Ok(self.clone());
                    }
                    let url = storage.store(&bucket, &key, data).await?;
                    Ok(ChatMessageContentPart::ImageUrl(ChatMessageImageUrl {
                        url,
                        detail: Some(format!("media_type:{};base64", media_type)),
                    }))
                }
            }
            ChatMessageContentPart::Document(document) => {
                let file_extension = if &document.source.media_type == "application/pdf" {
                    Some("pdf".to_string())
                } else {
                    None
                };
                let key = crate::storage::create_key(project_id, &file_extension);
                let data = crate::storage::base64_to_bytes(&document.source.data)?;
                if data.len() >= mq_max_payload() {
                    log::warn!(
                        "[STORAGE] MQ payload limit exceeded (document). Project ID: [{}], payload size: [{}]",
                        project_id,
                        data.len()
                    );
                    // Leave intact in case of error
                    return Ok(self.clone());
                }
                let url = storage.store(&bucket, &key, data).await?;
                Ok(ChatMessageContentPart::DocumentUrl(
                    ChatMessageDocumentUrl {
                        media_type: document.source.media_type.clone(),
                        url,
                    },
                ))
            }
            ChatMessageContentPart::ImageUrl(image_url) => {
                if let Some(base64_data) = raw_base64_from_data_url(&image_url.url) {
                    let data = crate::storage::base64_to_bytes(base64_data)?;
                    let key = crate::storage::create_key(project_id, &None);
                    if data.len() >= mq_max_payload() {
                        log::warn!(
                            "[STORAGE] MQ payload limit exceeded (image url). Project ID: [{}], payload size: [{}]",
                            project_id,
                            data.len()
                        );
                        // Leave intact in case of error
                        return Ok(self.clone());
                    }
                    let url = storage.store(&bucket, &key, data).await?;
                    Ok(ChatMessageContentPart::ImageUrl(ChatMessageImageUrl {
                        url,
                        detail: image_url.detail.clone(),
                    }))
                } else {
                    // Otherwise, assume it's a regular image url
                    Ok(self.clone())
                }
            }
            ChatMessageContentPart::ImageRawBytes(image) => {
                let key = crate::storage::create_key(project_id, &None);
                if image.image.len() >= mq_max_payload() {
                    log::warn!(
                        "[STORAGE] MQ payload limit exceeded (image raw bytes/aisdk). Project ID: [{}], payload size: [{}]",
                        project_id,
                        image.image.len()
                    );
                    // Leave intact in case of error
                    return Ok(self.clone());
                }
                let url = storage.store(&bucket, &key, image.image.clone()).await?;
                Ok(ChatMessageContentPart::ImageUrl(ChatMessageImageUrl {
                    url,
                    detail: image
                        .mime_type
                        .as_ref()
                        .map(|mime_type| format!("media_type:{};base64", mime_type)),
                }))
            }
            _ => Ok(self.clone()),
        }
    }
}

/// Extract the raw base64 data from a data URL.
fn raw_base64_from_data_url(data_url: &str) -> Option<&str> {
    // We only check the first 50 characters to avoid expensive regex matching.
    // The mimeType is fairly short, so 50 characters is more than enough.
    if DATA_URL_REGEX.is_match(&data_url.chars().take(50).collect::<String>()) {
        data_url.split_once(',').map(|(_, base64_data)| base64_data)
    } else {
        None
    }
}
