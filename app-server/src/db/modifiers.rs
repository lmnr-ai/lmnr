use chrono::{DateTime, Utc};
use serde::Deserialize;

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AbsoluteDateInterval {
    pub start_date: DateTime<Utc>,
    pub end_date: DateTime<Utc>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RelativeDateInterval {
    pub past_hours: String,
}

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
#[serde(untagged)]
pub enum DateRange {
    Relative(RelativeDateInterval),
    Absolute(AbsoluteDateInterval),
}

impl Default for DateRange {
    fn default() -> Self {
        DateRange::Relative(RelativeDateInterval {
            past_hours: String::from("24"),
        })
    }
}
