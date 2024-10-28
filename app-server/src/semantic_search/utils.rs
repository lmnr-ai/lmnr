use crate::language_model::{ChatMessage, ChatMessageContent, ChatMessageContentPart};
use anyhow::Result;
use serde::{
    ser::{SerializeStruct, Serializer},
    Serialize,
};

use super::semantic_search_grpc::query_response::QueryPoint;

impl Serialize for QueryPoint {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut state = serializer.serialize_struct("QueryPoint", 4)?;
        state.serialize_field("score", &self.score)?;
        state.serialize_field("content", &self.content)?;
        state.serialize_field("datasource_id", &self.datasource_id)?;
        state.serialize_field("data", &self.data)?;
        state.end()
    }
}

/// Merges chat messages into an embeddable string
///
/// Creates a string in the following format:
/// <role>:
/// <content>
/// ...
/// <role>:
/// <content>
///
/// This can be refactored to implement some trait Embeddable or something similar
pub fn merge_chat_messages(messages: &Vec<ChatMessage>) -> String {
    messages
        .iter()
        .map(|message| {
            // TODO: Remove all clones and make it more efficient
            let text_message = match &message.content {
                ChatMessageContent::Text(text) => text.clone(),
                ChatMessageContent::ContentPartList(parts) => parts
                    .iter()
                    .map(|part| match part {
                        ChatMessageContentPart::Text(text) => text.text.clone(),
                        _ => panic!("Expected text message"),
                    })
                    .collect::<Vec<String>>()
                    .join(""),
            };
            format!("{}:\n{}", message.role, text_message)
        })
        .collect::<Vec<String>>()
        .join("\n\n")
}
