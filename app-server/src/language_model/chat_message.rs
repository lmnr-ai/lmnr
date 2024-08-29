use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone, sqlx::FromRow, PartialEq)]
pub struct ChatMessageText {
    pub text: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessageImageUrl {
    pub url: String,
    #[serde(default)]
    pub detail: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessageImage {
    pub media_type: String, // e.g. "image/jpeg"
    pub data: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(tag = "type")]
pub enum ChatMessageContentPart {
    #[serde(rename = "text")]
    Text(ChatMessageText),
    #[serde(rename = "image_url")]
    ImageUrl(ChatMessageImageUrl),
    #[serde(rename = "image")]
    Image(ChatMessageImage),
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(untagged)]
pub enum ChatMessageContent {
    Text(String),
    ContentPartList(Vec<ChatMessageContentPart>),
}

#[derive(Debug, Serialize, Deserialize, Clone, sqlx::FromRow, PartialEq)]
pub struct ChatMessage {
    pub role: String,
    pub content: ChatMessageContent,
}

#[derive(Debug, Deserialize)]
pub struct ChatChunkDelta {
    pub content: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ChatChunkChoice {
    pub delta: ChatChunkDelta,
}

#[derive(Debug, Deserialize)]
pub struct ChatCompletionChunk {
    pub choices: Vec<ChatChunkChoice>,
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
