use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use super::agent_manager_grpc::{
    browser_state::{
        interactive_element::Coordinates as CoordinatesGrpc,
        InteractiveElement as InteractiveElementGrpc, TabInfo as TabInfoGrpc,
    },
    chat_message::{
        content_block::{
            image_content::ImageSource as ImageSourceGrpc,
            Content as ChatMessageContentBlockContentGrpc,
        },
        Content as ChatMessageContentGrpc, ContentBlock as ChatMessageContentBlockGrpc,
        ContentList as ContentListGrpc,
    },
    run_agent_response_stream_chunk::ChunkType as RunAgentResponseStreamChunkTypeGrpc,
    ActionResult as ActionResultGrpc, AgentOutput as AgentOutputGrpc, AgentState as AgentStateGrpc,
    BrowserState as BrowserStateGrpc, ChatMessage as ChatMessageGrpc,
    LaminarSpanContext as LaminarSpanContextGrpc,
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

impl Into<ChatMessageContent> for ChatMessageContentGrpc {
    fn into(self) -> ChatMessageContent {
        match self {
            ChatMessageContentGrpc::RawText(s) => ChatMessageContent::String(s),
            ChatMessageContentGrpc::ContentList(l) => ChatMessageContent::List(l.into()),
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

#[derive(Serialize, Deserialize, Default, Clone)]
#[serde(rename_all(serialize = "camelCase"))]

pub struct TabInfo {
    page_id: i64,
    url: String,
    title: String,
}

impl Into<TabInfo> for TabInfoGrpc {
    fn into(self) -> TabInfo {
        TabInfo {
            page_id: self.page_id,
            url: self.url,
            title: self.title,
        }
    }
}

#[derive(Serialize, Deserialize, Default, Clone)]
pub struct Coordinates {
    x: i64,
    y: i64,
    #[serde(default)]
    width: Option<i64>,
    #[serde(default)]
    height: Option<i64>,
}

impl Into<Coordinates> for CoordinatesGrpc {
    fn into(self) -> Coordinates {
        Coordinates {
            x: self.x,
            y: self.y,
            width: self.width,
            height: self.height,
        }
    }
}

#[derive(Serialize, Deserialize, Default, Clone)]
#[serde(rename_all(serialize = "camelCase"))]
pub struct InteractiveElement {
    index: i64,
    #[serde(alias = "tagName", alias = "tag_name")]
    tag_name: String,
    text: String,
    attributes: HashMap<String, String>,
    viewport: Coordinates,
    page: Coordinates,
    center: Coordinates,
    weight: i64,
    #[serde(alias = "browserAgentId", alias = "browser_agent_id")]
    browser_agent_id: String,
    #[serde(default, alias = "inputType", alias = "input_type")]
    input_type: Option<String>,
}

impl Into<InteractiveElement> for InteractiveElementGrpc {
    fn into(self) -> InteractiveElement {
        InteractiveElement {
            index: self.index,
            tag_name: self.tag_name,
            text: self.text,
            attributes: self
                .attributes
                .into_iter()
                .map(|(k, v)| (k, v.into()))
                .collect(),
            viewport: self.viewport.unwrap().into(),
            page: self.page.unwrap().into(),
            center: self.center.unwrap().into(),
            weight: self.weight,
            browser_agent_id: self.browser_agent_id,
            input_type: self.input_type,
        }
    }
}
#[derive(Serialize, Deserialize, Default, Clone)]
#[serde(rename_all(serialize = "camelCase"))]
pub struct BrowserState {
    url: String,
    tabs: Vec<TabInfo>,
    screenshot_with_highlights: Option<String>,
    screenshot: Option<String>,
    pixels_above: i64,
    pixels_below: i64,
    // TODO: change String key type to i64, once the lambda has been fixed
    interactive_elements: HashMap<String, InteractiveElement>,
}

impl Into<BrowserState> for BrowserStateGrpc {
    fn into(self) -> BrowserState {
        BrowserState {
            url: self.url,
            tabs: self.tabs.into_iter().map(|t| t.into()).collect(),
            screenshot_with_highlights: self.screenshot_with_highlights,
            screenshot: self.screenshot,
            pixels_above: self.pixels_above,
            pixels_below: self.pixels_below,
            interactive_elements: self
                .interactive_elements
                .into_iter()
                .map(|(k, v)| (k.to_string(), v.into()))
                .collect(),
        }
    }
}

#[derive(Serialize, Deserialize, Default, Clone)]
#[serde(rename_all(serialize = "camelCase"))]
pub struct AgentState {
    messages: Vec<ChatMessage>,
    browser_state: BrowserState,
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
            browser_state: self.browser_state.unwrap().into(),
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

impl Into<RunAgentResponseStreamChunk> for RunAgentResponseStreamChunkGrpc {
    fn into(self) -> RunAgentResponseStreamChunk {
        match self.chunk_type.unwrap() {
            RunAgentResponseStreamChunkTypeGrpc::StepChunkContent(s) => {
                RunAgentResponseStreamChunk::Step(s.into())
            }
            RunAgentResponseStreamChunkTypeGrpc::AgentOutput(a) => {
                RunAgentResponseStreamChunk::FinalOutput(FinalOutputChunkContent {
                    content: a.into(),
                })
            }
        }
    }
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all(serialize = "camelCase"))]
pub struct StepChunkContent {
    pub action_result: ActionResult,
    pub summary: String,
}

impl Into<StepChunkContent> for StepChunkContentGrpc {
    fn into(self) -> StepChunkContent {
        StepChunkContent {
            action_result: self.action_result.unwrap().into(),
            summary: self.summary,
        }
    }
}
#[derive(Serialize, Deserialize, Clone)]
pub struct FinalOutputChunkContent {
    pub content: AgentOutput,
}
