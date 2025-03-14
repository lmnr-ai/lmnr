use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use super::agent_manager_grpc::{
    chat_message::{
        content_block::{
            image_content::ImageSource as ImageSourceGrpc,
            Content as ChatMessageContentBlockContentGrpc, ImageContent as ImageContentGrpc,
            TextContent as TextContentGrpc,
        },
        Content as ChatMessageContentGrpc, ContentBlock as ChatMessageContentBlockGrpc,
        ContentList as ContentListGrpc,
    },
    run_agent_response_stream_chunk::ChunkType as RunAgentResponseStreamChunkTypeGrpc,
    ActionResult as ActionResultGrpc, AgentOutput as AgentOutputGrpc, AgentState as AgentStateGrpc,
    ChatMessage as ChatMessageGrpc, LaminarSpanContext as LaminarSpanContextGrpc,
    RunAgentResponseStreamChunk as RunAgentResponseStreamChunkGrpc,
    StepChunkContent as StepChunkContentGrpc,
};

#[derive(Debug, Clone, Deserialize)]
pub struct LaminarSpanContext {
    pub trace_id: String,
    pub span_id: String,
    pub is_remote: bool,
}

impl Into<LaminarSpanContextGrpc> for LaminarSpanContext {
    fn into(self) -> LaminarSpanContextGrpc {
        LaminarSpanContextGrpc {
            trace_id: self.trace_id,
            span_id: self.span_id,
            is_remote: self.is_remote,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ModelProvider {
    Anthropic,
    Bedrock,
}

impl ModelProvider {
    pub fn to_i32(&self) -> i32 {
        match self {
            ModelProvider::Anthropic => 0,
            ModelProvider::Bedrock => 1,
        }
    }
}

#[derive(Serialize, Deserialize, Default, Clone)]
#[serde(rename_all(serialize = "camelCase"))]
pub struct ActionResult {
    #[serde(default)]
    pub is_done: bool,
    #[serde(default)]
    pub content: Option<String>,
    #[serde(default)]
    pub error: Option<String>,
}

impl Into<ActionResult> for ActionResultGrpc {
    fn into(self) -> ActionResult {
        ActionResult {
            is_done: self.is_done.unwrap_or_default(),
            content: self.content,
            error: self.error,
        }
    }
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ChatMessageContentTextBlock {
    text: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ChatMessageImageUrlBlock {
    image_url: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ChatMessageImageBase64Block {
    image_b64: String,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(untagged)]
pub enum ChatMessageImageBlock {
    Url(ChatMessageImageUrlBlock),
    Base64(ChatMessageImageBase64Block),
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum ChatMessageContentBlock {
    Text(ChatMessageContentTextBlock),
    Image(ChatMessageImageBlock),
}

impl Into<ChatMessageContentBlockGrpc> for ChatMessageContentBlock {
    fn into(self) -> ChatMessageContentBlockGrpc {
        match self {
            ChatMessageContentBlock::Text(t) => ChatMessageContentBlockGrpc {
                content: Some(ChatMessageContentBlockContentGrpc::TextContent(
                    TextContentGrpc {
                        text: t.text,
                        cache_control: None,
                    },
                )),
            },
            ChatMessageContentBlock::Image(i) => match i {
                ChatMessageImageBlock::Base64(b) => ChatMessageContentBlockGrpc {
                    content: Some(ChatMessageContentBlockContentGrpc::ImageContent(
                        ImageContentGrpc {
                            image_source: Some(ImageSourceGrpc::ImageB64(b.image_b64)),
                            cache_control: None,
                        },
                    )),
                },
                ChatMessageImageBlock::Url(u) => ChatMessageContentBlockGrpc {
                    content: Some(ChatMessageContentBlockContentGrpc::ImageContent(
                        ImageContentGrpc {
                            image_source: Some(ImageSourceGrpc::ImageUrl(u.image_url)),
                            cache_control: None,
                        },
                    )),
                },
            },
        }
    }
}

impl Into<ChatMessageContentBlock> for ChatMessageContentBlockGrpc {
    fn into(self) -> ChatMessageContentBlock {
        match self.content {
            Some(ChatMessageContentBlockContentGrpc::TextContent(t)) => {
                ChatMessageContentBlock::Text(ChatMessageContentTextBlock { text: t.text })
            }
            Some(ChatMessageContentBlockContentGrpc::ImageContent(i)) => match i.image_source {
                Some(ImageSourceGrpc::ImageB64(b64)) => ChatMessageContentBlock::Image(
                    ChatMessageImageBlock::Base64(ChatMessageImageBase64Block { image_b64: b64 }),
                ),
                Some(ImageSourceGrpc::ImageUrl(url)) => ChatMessageContentBlock::Image(
                    ChatMessageImageBlock::Url(ChatMessageImageUrlBlock { image_url: url }),
                ),
                None => ChatMessageContentBlock::Text(ChatMessageContentTextBlock {
                    text: String::new(),
                }),
            },
            None => ChatMessageContentBlock::Text(ChatMessageContentTextBlock {
                text: String::new(),
            }),
        }
    }
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(untagged)]
pub enum ChatMessageContent {
    String(String),
    List(Vec<ChatMessageContentBlock>),
}

impl Into<Vec<ChatMessageContentBlock>> for ContentListGrpc {
    fn into(self) -> Vec<ChatMessageContentBlock> {
        self.content_blocks.into_iter().map(|c| c.into()).collect()
    }
}

impl Into<ContentListGrpc> for Vec<ChatMessageContentBlock> {
    fn into(self) -> ContentListGrpc {
        ContentListGrpc {
            content_blocks: self.into_iter().map(|c| c.into()).collect(),
        }
    }
}

impl Into<ChatMessageContent> for ChatMessageContentGrpc {
    fn into(self) -> ChatMessageContent {
        match self {
            ChatMessageContentGrpc::RawText(s) => ChatMessageContent::String(s),
            ChatMessageContentGrpc::ContentList(l) => ChatMessageContent::List(l.into()),
        }
    }
}

impl Into<ChatMessageContentGrpc> for ChatMessageContent {
    fn into(self) -> ChatMessageContentGrpc {
        match self {
            ChatMessageContent::String(s) => ChatMessageContentGrpc::RawText(s),
            ChatMessageContent::List(l) => ChatMessageContentGrpc::ContentList(l.into()),
        }
    }
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ChatMessage {
    role: String,
    content: ChatMessageContent,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    tool_call_id: Option<String>,
    #[serde(default)]
    is_state_message: bool,
}

impl Into<ChatMessage> for ChatMessageGrpc {
    fn into(self) -> ChatMessage {
        ChatMessage {
            role: self.role,
            content: self.content.unwrap().into(),
            name: self.name,
            tool_call_id: self.tool_call_id,
            is_state_message: self.is_state_message.unwrap_or_default(),
        }
    }
}

impl Into<ChatMessageGrpc> for ChatMessage {
    fn into(self) -> ChatMessageGrpc {
        ChatMessageGrpc {
            role: self.role,
            content: Some(self.content.into()),
            name: self.name,
            tool_call_id: self.tool_call_id,
            is_state_message: Some(self.is_state_message),
        }
    }
}

#[derive(Serialize, Deserialize, Default, Clone)]
#[serde(rename_all(serialize = "camelCase"))]
pub struct AgentState {
    messages: Vec<ChatMessage>,
    // browser_state: BrowserState,
}

#[derive(Serialize, Deserialize, Default, Clone)]
pub struct AgentOutput {
    pub state: AgentState,
    pub result: ActionResult,
}

impl Into<AgentOutput> for AgentOutputGrpc {
    fn into(self) -> AgentOutput {
        AgentOutput {
            state: self.agent_state.unwrap().into(),
            result: self.result.unwrap().into(),
        }
    }
}

impl Into<AgentState> for AgentStateGrpc {
    fn into(self) -> AgentState {
        AgentState {
            messages: self.messages.into_iter().map(|c| c.into()).collect(),
        }
    }
}

impl Into<AgentStateGrpc> for AgentState {
    fn into(self) -> AgentStateGrpc {
        AgentStateGrpc {
            messages: self.messages.into_iter().map(|c| c.into()).collect(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(
    tag = "chunk_type",
    rename_all(deserialize = "snake_case", serialize = "camelCase")
)]
pub enum RunAgentResponseStreamChunk {
    Step(StepChunkContent),
    FinalOutput(FinalOutputChunkContent),
}

impl RunAgentResponseStreamChunk {
    pub fn set_message_id(&mut self, message_id: Uuid) {
        match self {
            RunAgentResponseStreamChunk::Step(s) => s.message_id = message_id,
            RunAgentResponseStreamChunk::FinalOutput(f) => f.message_id = message_id,
        }
    }

    pub fn message_content(&self) -> Value {
        match self {
            RunAgentResponseStreamChunk::Step(step) => serde_json::json!({
                "summary": step.summary,
                "action_result": step.action_result,
            }),
            RunAgentResponseStreamChunk::FinalOutput(final_output) => serde_json::json!({
                "text": final_output.content.result.content.clone().unwrap_or_default(),
            }),
        }
    }
}

impl Into<RunAgentResponseStreamChunk> for RunAgentResponseStreamChunkGrpc {
    fn into(self) -> RunAgentResponseStreamChunk {
        match self.chunk_type.unwrap() {
            RunAgentResponseStreamChunkTypeGrpc::StepChunkContent(s) => {
                RunAgentResponseStreamChunk::Step(s.into())
            }
            RunAgentResponseStreamChunkTypeGrpc::AgentOutput(a) => {
                RunAgentResponseStreamChunk::FinalOutput(FinalOutputChunkContent {
                    message_id: Uuid::nil(),
                    content: a.into(),
                })
            }
        }
    }
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all(serialize = "camelCase"))]
pub struct StepChunkContent {
    #[serde(skip_deserializing)]
    pub message_id: Uuid,
    pub action_result: ActionResult,
    pub summary: String,
}

impl Into<StepChunkContent> for StepChunkContentGrpc {
    fn into(self) -> StepChunkContent {
        StepChunkContent {
            message_id: Uuid::nil(),
            action_result: self.action_result.unwrap().into(),
            summary: self.summary,
        }
    }
}
#[derive(Serialize, Deserialize, Clone)]
pub struct FinalOutputChunkContent {
    #[serde(skip_deserializing)]
    pub message_id: Uuid,
    pub content: AgentOutput,
}
