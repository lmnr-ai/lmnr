use std::collections::HashMap;

use anyhow::Result;
use async_trait::async_trait;
use code_executor_grpc::{chat_message_content, chat_message_content_part, StringList};

use crate::{
    language_model::{
        ChatMessageContent, ChatMessageContentPart, ChatMessageImage, ChatMessageImageUrl,
        ChatMessageText,
    },
    pipeline::nodes::{HandleType, NodeInput},
};

use self::code_executor_grpc::{
    arg, chat_message_list, execute_code_response, Arg,
    ChatMessageContent as ArgChatMessageContent,
    ChatMessageContentPart as ArgChatMessageContentPart, ChatMessageImage as ArgChatMessageImage,
    ChatMessageImageUrl as ArgChatMessageImageUrl, ChatMessageList,
    ChatMessageText as ArgChatMessageText, ContentPartList as ArgContentPartList,
    ExecuteCodeResponse,
};

pub mod code_executor_grpc;
pub mod code_executor_impl;
pub mod mock;

#[async_trait]
pub trait CodeExecutor: Sync + Send {
    async fn execute(
        &self,
        code: &String,
        fn_name: &String,
        args: &HashMap<String, NodeInput>,
        return_type: HandleType,
    ) -> Result<NodeInput>;
}

impl Into<ArgChatMessageContent> for ChatMessageContent {
    fn into(self) -> ArgChatMessageContent {
        ArgChatMessageContent {
            value: match self {
                ChatMessageContent::Text(t) => Some(chat_message_content::Value::Text(t)),
                ChatMessageContent::ContentPartList(parts) => Some(
                    chat_message_content::Value::ContentPartList(ArgContentPartList {
                        parts: parts
                            .into_iter()
                            .map(|p| match p {
                                ChatMessageContentPart::Text(t) => ArgChatMessageContentPart {
                                    value: Some(chat_message_content_part::Value::Text(
                                        ArgChatMessageText { text: t.text },
                                    )),
                                },
                                ChatMessageContentPart::Image(image) => ArgChatMessageContentPart {
                                    value: Some(chat_message_content_part::Value::Image(
                                        ArgChatMessageImage {
                                            media_type: image.media_type,
                                            data: image.data,
                                        },
                                    )),
                                },
                                ChatMessageContentPart::ImageUrl(image_url) => {
                                    ArgChatMessageContentPart {
                                        value: Some(chat_message_content_part::Value::ImageUrl(
                                            ArgChatMessageImageUrl { url: image_url.url },
                                        )),
                                    }
                                }
                                // FIXME: Remove this once we update the code executor
                                ChatMessageContentPart::Document(document) => {
                                    ArgChatMessageContentPart {
                                        value: Some(chat_message_content_part::Value::Text(
                                            ArgChatMessageText {
                                                text: serde_json::json!(document.source.to_owned())
                                                    .to_string(),
                                            },
                                        )),
                                    }
                                }
                                // FIXME: Remove this once we update the code executor
                                ChatMessageContentPart::DocumentUrl(document_url) => {
                                    ArgChatMessageContentPart {
                                        value: Some(chat_message_content_part::Value::Text(
                                            ArgChatMessageText {
                                                text: serde_json::json!(document_url.url)
                                                    .to_string(),
                                            },
                                        )),
                                    }
                                }
                            })
                            .collect(),
                    }),
                ),
            },
        }
    }
}

impl Into<ChatMessageContent> for ArgChatMessageContent {
    fn into(self) -> ChatMessageContent {
        match self.value.unwrap() {
            chat_message_content::Value::Text(t) => ChatMessageContent::Text(t),
            chat_message_content::Value::ContentPartList(parts) => {
                ChatMessageContent::ContentPartList(
                    parts
                        .parts
                        .into_iter()
                        .map(|p| match p.value.unwrap() {
                            chat_message_content_part::Value::Text(t) => {
                                ChatMessageContentPart::Text(ChatMessageText { text: t.text })
                            }
                            chat_message_content_part::Value::Image(image) => {
                                ChatMessageContentPart::Image(ChatMessageImage {
                                    media_type: image.media_type,
                                    data: image.data,
                                })
                            }
                            chat_message_content_part::Value::ImageUrl(image_url) => {
                                ChatMessageContentPart::ImageUrl(ChatMessageImageUrl {
                                    url: image_url.url,
                                    detail: None,
                                })
                            }
                        })
                        .collect(),
                )
            }
        }
    }
}

impl Into<Arg> for NodeInput {
    fn into(self) -> Arg {
        match self {
            NodeInput::String(s) => Arg {
                value: Some(arg::Value::StringValue(s)),
            },
            NodeInput::StringList(values) => Arg {
                value: Some(arg::Value::StringListValue(StringList { values })),
            },
            NodeInput::ChatMessageList(c) => Arg {
                value: Some(arg::Value::MessagesValue(ChatMessageList {
                    messages: c
                        .into_iter()
                        .map(|m| chat_message_list::ChatMessage {
                            content: Some(m.content.into()),
                            role: m.role,
                        })
                        .collect(),
                })),
            },
            NodeInput::Float(f) => Arg {
                value: Some(arg::Value::FloatValue(f)),
            },
            NodeInput::ConditionedValue(v) => v.value.as_ref().clone().into(),
            NodeInput::Boolean(b) => Arg {
                value: Some(arg::Value::BoolValue(b)), // TMP
            },
        }
    }
}

impl TryInto<NodeInput> for ExecuteCodeResponse {
    type Error = anyhow::Error;

    fn try_into(self) -> Result<NodeInput, Self::Error> {
        match self.response.unwrap() {
            execute_code_response::Response::Result(r) => match r.value.unwrap() {
                arg::Value::StringValue(s) => Ok(NodeInput::String(s)),
                arg::Value::StringListValue(s) => Ok(NodeInput::StringList(s.values)),
                arg::Value::MessagesValue(c) => Ok(NodeInput::ChatMessageList(
                    c.messages
                        .into_iter()
                        .map(|m| crate::language_model::ChatMessage {
                            role: m.role,
                            content: m.content.unwrap().into(),
                        })
                        .collect(),
                )),
                arg::Value::FloatValue(f) => Ok(NodeInput::Float(f)),
                arg::Value::BoolValue(b) => Ok(NodeInput::Boolean(b)),
            },
            execute_code_response::Response::Error(e) => Err(anyhow::anyhow!(e.message)),
        }
    }
}
