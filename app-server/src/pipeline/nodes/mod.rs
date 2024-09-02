use std::collections::HashMap;

use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use uuid::Uuid;

use crate::language_model::ChatMessage;
use crate::language_model::{ChatMessageContent, ChatMessageContentPart};

use super::runner::PipelineRunnerError;
use super::trace::{MetaLog, RunTrace};

mod condition;
mod error;
mod extractor;
mod format_validator;
mod input;
mod json_extractor;
pub mod llm;
pub mod map;
mod output;
mod semantic_search;
mod semantic_search_utils;
mod semantic_similarity;
mod semantic_switch;
mod string_template;
pub mod subpipeline;
mod switch;
pub mod utils;
pub mod zenguard;
use anyhow::Error;

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(untagged)]
pub enum NodeInput {
    Boolean(bool),
    String(String),
    StringList(Vec<String>),
    ChatMessageList(Vec<ChatMessage>),
    Float(f64),
    // `ConditionedValue` is internal only for the conditional nodes.
    // We disallow sending this format from the endpoint or workshop request.
    // Internally, serde may deserialize an untagged array `["a", "b"]` as a matching struct
    // `ConditionedValue { condition: "a", value: "b" }`.
    // Skip deserializing to prevent this behaviour.
    #[serde(skip_deserializing)]
    ConditionedValue(ConditionedValue),
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
pub struct ConditionedValue {
    pub condition: String,
    pub value: Box<NodeInput>,
}

impl Into<NodeInput> for String {
    fn into(self) -> NodeInput {
        NodeInput::String(self)
    }
}

impl Into<NodeInput> for Vec<String> {
    fn into(self) -> NodeInput {
        NodeInput::StringList(self)
    }
}

impl Into<NodeInput> for Vec<ChatMessage> {
    fn into(self) -> NodeInput {
        NodeInput::ChatMessageList(self)
    }
}

impl Into<NodeInput> for ConditionedValue {
    fn into(self) -> NodeInput {
        NodeInput::ConditionedValue(self)
    }
}

impl Into<NodeInput> for serde_json::Value {
    fn into(self) -> NodeInput {
        match serde_json::from_value::<NodeInput>(self.clone()) {
            Ok(node_input) => node_input,
            Err(_) => NodeInput::String(self.to_string()),
        }
    }
}

impl Into<Value> for NodeInput {
    fn into(self) -> Value {
        json!(self)
    }
}

// TODO: Implement TryInto and substitute in all nodes
impl Into<String> for NodeInput {
    fn into(self) -> String {
        match self {
            NodeInput::Boolean(b) => b.to_string(),
            NodeInput::String(s) => s,
            NodeInput::StringList(strings) => format!("[{}]", strings.join(", ")),
            NodeInput::ChatMessageList(messages) => messages
                .iter()
                .map(|message| match message.content {
                    ChatMessageContent::Text(ref text) => {
                        format!("{}:\n{}", message.role, text)
                    }
                    ChatMessageContent::ContentPartList(ref parts) => {
                        let text_message = parts
                            .iter()
                            .map(|part| match part {
                                ChatMessageContentPart::Text(ref text) => text.text.clone(), // TODO: Do it more efficiently than clone
                                _ => {
                                    panic!("Expected text message")
                                }
                            })
                            .collect::<Vec<String>>()
                            .join("");
                        format!("{}:\n{}", message.role, text_message)
                    }
                })
                .collect::<Vec<String>>()
                .join("\n\n"),
            NodeInput::Float(f) => f.to_string(),
            NodeInput::ConditionedValue(conditioned_value) => (*conditioned_value.value).into(),
        }
    }
}

impl TryInto<Vec<ChatMessage>> for NodeInput {
    type Error = Error;

    fn try_into(self) -> Result<Vec<ChatMessage>, Self::Error> {
        match self {
            NodeInput::Boolean(_b) => Err(anyhow::anyhow!(
                "Cannot convert GraphInput::Boolean to Vec<ChatMessage>"
            )),
            NodeInput::String(_s) => Err(anyhow::anyhow!(
                "Cannot convert GraphInput::String to Vec<ChatMessage>"
            )),
            NodeInput::StringList(_strings) => Err(anyhow::anyhow!(
                "Cannot convert GraphInput::StringList to Vec<ChatMessage>"
            )),
            NodeInput::ChatMessageList(messages) => Ok(messages),
            NodeInput::Float(_f) => Err(anyhow::anyhow!(
                "Cannot convert GraphInput::Float to Vec<ChatMessage>"
            )),
            NodeInput::ConditionedValue(_v) => Err(anyhow::anyhow!(
                "Cannot convert GraphInput::ConditionedValue to Vec<ChatMessage>"
            )),
        }
    }
}

impl TryInto<ConditionedValue> for NodeInput {
    type Error = Error;

    fn try_into(self) -> Result<ConditionedValue, Self::Error> {
        match self {
            NodeInput::Boolean(_b) => Err(anyhow::anyhow!(
                "Cannot convert GraphInput::Boolean to ConditionedValue"
            )),
            NodeInput::String(_s) => Err(anyhow::anyhow!(
                "Cannot convert GraphInput::String to ConditionedValue"
            )),
            NodeInput::StringList(_strings) => Err(anyhow::anyhow!(
                "Cannot convert GraphInput::StringList to ConditionedValue"
            )),
            NodeInput::ChatMessageList(_messages) => Err(anyhow::anyhow!(
                "Cannot convert GraphInput::ChatMessageList to ConditionedValue"
            )),
            NodeInput::Float(_f) => Err(anyhow::anyhow!(
                "Cannot convert GraphInput::Float to ConditionedValue"
            )),
            NodeInput::ConditionedValue(v) => Ok(v),
        }
    }
}

// A message that is being passed between nodes
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Message {
    pub id: Uuid,
    /// output value of producing node in form of NodeInput for the following consumer
    /// it's ok to clone because it's an enum of Arc
    pub value: NodeInput,
    /// all input messages to this node
    pub input_message_ids: Vec<Uuid>,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub node_id: Uuid,
    pub node_name: String,
    pub node_type: String,
    /// all node per-run metadata that needs to be logged at the end of execution
    pub meta_log: Option<MetaLog>,
}

impl Message {
    pub fn empty() -> Self {
        Self {
            id: Uuid::new_v4(),
            value: NodeInput::String(String::new()),
            input_message_ids: vec![],
            start_time: Utc::now(),
            end_time: Utc::now(),
            node_id: Uuid::new_v4(),
            node_name: String::new(),
            node_type: String::new(),
            meta_log: None,
        }
    }
}

#[derive(Debug, Deserialize, Clone, PartialEq, Serialize)]
pub enum HandleType {
    String,
    StringList,
    ChatMessageList,
    Float,
    Any,
}

#[derive(Debug, Deserialize, Clone, Serialize)]
pub struct Handle {
    pub id: Uuid,
    pub name: Option<String>,
    #[serde(rename = "type")]
    pub handle_type: HandleType,
    #[serde(default)]
    #[serde(rename = "isCyclic")]
    pub is_cyclic: bool,
}

impl Handle {
    pub fn name_force(&self) -> String {
        self.name.clone().unwrap()
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "type")]
pub enum Node {
    Input(input::InputNode),
    Output(output::OutputNode),
    Error(error::ErrorNode),
    StringTemplate(string_template::StringTemplateNode),
    Subpipeline(subpipeline::SubpipelineNode),
    Map(map::MapNode),
    SemanticSearch(semantic_search::SemanticSearchNode),
    SemanticSwitch(semantic_switch::SemanticSwitchNode),
    Condition(condition::ConditionNode),
    FormatValidator(format_validator::FormatValidatorNode),
    Extractor(extractor::ExtractorNode),
    JsonExtractor(json_extractor::JsonExtractorNode),
    Zenguard(zenguard::ZenguardNode),
    LLM(llm::LLMNode),
    Switch(switch::SwitchNode),
    SemanticSimilarity(semantic_similarity::SemanticSimilarityNode),
}

impl Node {
    // `enum_dispatch` would take care of this if this was a method, not field;
    // `dyn` implementations are too slow
    pub fn id(&self) -> Uuid {
        match self {
            Self::Input(node) => node.id,
            Self::Output(node) => node.id,
            Self::Error(node) => node.id,
            Self::StringTemplate(node) => node.id,
            Self::Subpipeline(node) => node.id,
            Self::Map(node) => node.id,
            Self::SemanticSearch(node) => node.id,
            Self::SemanticSwitch(node) => node.id,
            Self::Condition(node) => node.id,
            Self::FormatValidator(node) => node.id,
            Self::Extractor(node) => node.id,
            Self::Zenguard(node) => node.id,
            Self::LLM(node) => node.id,
            Self::Switch(node) => node.id,
            Self::JsonExtractor(node) => node.id,
            Self::SemanticSimilarity(node) => node.id,
        }
        .clone()
    }

    // uses #[serde(tag)] instead of mapping to get the node kind
    pub fn node_type(&self) -> String {
        json!(&self)
            .as_object()
            .unwrap()
            .get("type")
            .unwrap()
            .to_owned()
            .as_str()
            .unwrap()
            .to_owned()
    }

    // `enum_dispatch` would take care of this if this was a method, not field;
    // `dyn` implementations are too slow
    pub fn name(&self) -> String {
        match self {
            Self::Input(node) => node.name.as_str(),
            Self::Output(node) => node.name.as_str(),
            Self::Error(node) => node.name.as_str(),
            Self::StringTemplate(node) => node.name.as_str(),
            Self::Subpipeline(node) => node.name.as_str(),
            Self::Map(node) => node.name.as_str(),
            Self::SemanticSearch(node) => node.name.as_str(),
            Self::SemanticSwitch(node) => node.name.as_str(),
            Self::Condition(node) => node.name.as_str(),
            Self::FormatValidator(node) => node.name.as_str(),
            Self::Extractor(node) => node.name.as_str(),
            Self::Zenguard(node) => node.name.as_str(),
            Self::LLM(node) => node.name.as_str(),
            Self::Switch(node) => node.name.as_str(),
            Self::JsonExtractor(node) => node.name.as_str(),
            Self::SemanticSimilarity(node) => node.name.as_str(),
        }
        .to_owned()
    }
}

#[derive(Debug, Serialize)]
#[serde(tag = "type", content = "content")]
pub enum StreamChunk {
    /// NodeChunk during streaming events during the execution
    NodeChunk(NodeStreamChunk),
    /// NodeEnd signals the end of a node's execution
    NodeEnd(NodeStreamEnd),
    /// Output for v2 endpoint run
    GraphRunOutput(GraphRunOutput),
    /// Error for v2 endpoint run
    RunEndpointEventError(RunEndpointEventError),
    /// Error for workshop runs.
    /// Note that workshop runs represent RunningError using RunTrace
    Error(PipelineRunnerError),
    /// Trace for workshop runs (both successful and failed)
    RunTrace(RunTrace),

    Breakpoint(BreakpointChunk),
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BreakpointChunk {
    pub node_id: Uuid,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeStreamChunk {
    pub id: Uuid,
    pub node_id: Uuid,
    pub node_name: String,
    pub node_type: String,
    pub content: NodeInput,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeStreamEnd {
    pub message: Message,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunEndpointEventError {
    pub error: PipelineRunnerError,
    /// Run id to be used in logs
    ///
    /// Option because we don't record logs for some errors
    pub run_id: Option<Uuid>,
}

/// Lightweight representation of an Output node's result
///
/// This is the truncated version of graph's Message without full trace.
#[derive(Debug, Serialize, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphOutput {
    pub value: NodeInput,
}

#[derive(Debug, Serialize, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphRunOutput {
    pub outputs: HashMap<String, GraphOutput>,
    pub run_id: Uuid,
}
