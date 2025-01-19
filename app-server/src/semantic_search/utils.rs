use crate::{
    db::modifiers::DateRange as DBDateRange,
    language_model::{ChatMessage, ChatMessageContent, ChatMessageContentPart},
};
use anyhow::Result;
use chrono::{DateTime, Duration, Utc};
use serde::{
    ser::{SerializeStruct, Serializer},
    Serialize,
};

use super::semantic_search_grpc::{query_response::QueryPoint, DateRange, DateRanges};

impl Serialize for QueryPoint {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut state = serializer.serialize_struct("QueryPoint", 4)?;
        state.serialize_field("score", &self.score)?;
        state.serialize_field("datapoint_id", &self.datapoint_id)?;
        state.serialize_field("datasource_id", &self.datasource_id)?;
        state.serialize_field("data", &self.data)?;
        state.end()
    }
}

pub fn date_to_timestamp(date: DateTime<Utc>) -> prost_types::Timestamp {
    prost_types::Timestamp {
        seconds: date.timestamp(),
        nanos: date.timestamp_subsec_nanos() as i32,
    }
}

impl DateRanges {
    pub fn from_name_and_db_range(name: &str, db_range: DBDateRange) -> Self {
        let (lte, gte) = match db_range {
            DBDateRange::Relative(relative) => {
                let past_hours = relative.past_hours.parse::<u64>().unwrap();
                let end_date = Utc::now();
                let start_date = end_date - Duration::hours(past_hours as i64);
                (date_to_timestamp(end_date), date_to_timestamp(start_date))
            }
            DBDateRange::Absolute(absolute) => (
                date_to_timestamp(absolute.end_date),
                date_to_timestamp(absolute.start_date),
            ),
        };
        DateRanges {
            date_ranges: vec![DateRange {
                key: name.to_string(),
                gte: Some(gte),
                lte: Some(lte),
            }],
        }
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
