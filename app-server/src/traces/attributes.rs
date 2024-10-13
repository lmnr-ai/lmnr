use chrono::{DateTime, Utc};
use uuid::Uuid;

use crate::db::trace::TraceType;

#[derive(Default, Clone, Debug)]
pub struct TraceAttributes {
    pub id: Uuid,
    pub start_time: Option<DateTime<Utc>>,
    pub end_time: Option<DateTime<Utc>>,
    pub input_token_count: Option<i64>,
    pub output_token_count: Option<i64>,
    /// Total token count is not calculated on this struct and must be set manually
    pub total_token_count: Option<i64>,
    pub input_cost: Option<f64>,
    pub output_cost: Option<f64>,
    /// Total costis not calculated on this struct and must be set manually
    pub cost: Option<f64>,
    pub success: Option<bool>,
    pub session_id: Option<String>,
    pub user_id: Option<String>,
    pub trace_type: Option<TraceType>,
}

impl TraceAttributes {
    pub fn new(trace_id: Uuid) -> Self {
        Self {
            id: trace_id,
            ..Default::default()
        }
    }

    pub fn add_total_tokens(&mut self, tokens: i64) {
        self.total_token_count = Some(self.total_token_count.unwrap_or(0) + tokens);
    }

    pub fn add_input_tokens(&mut self, tokens: i64) {
        self.input_token_count = Some(self.input_token_count.unwrap_or(0) + tokens);
    }

    pub fn add_output_tokens(&mut self, tokens: i64) {
        self.output_token_count = Some(self.output_token_count.unwrap_or(0) + tokens);
    }

    pub fn add_total_cost(&mut self, cost: f64) {
        self.cost = Some(self.cost.unwrap_or(0.0) + cost);
    }

    pub fn add_input_cost(&mut self, cost: f64) {
        self.input_cost = Some(self.input_cost.unwrap_or(0.0) + cost);
    }

    pub fn add_output_cost(&mut self, cost: f64) {
        self.output_cost = Some(self.output_cost.unwrap_or(0.0) + cost);
    }

    pub fn update_start_time(&mut self, start_time: DateTime<Utc>) {
        if self.start_time.is_none() || self.start_time.unwrap() > start_time {
            self.start_time = Some(start_time);
        }
    }

    pub fn update_end_time(&mut self, end_time: DateTime<Utc>) {
        if self.end_time.is_none() || self.end_time.unwrap() < end_time {
            self.end_time = Some(end_time);
        }
    }
    pub fn update_session_id(&mut self, session_id: Option<String>) {
        self.session_id = session_id;
    }

    pub fn update_user_id(&mut self, user_id: Option<String>) {
        self.user_id = user_id;
    }

    pub fn update_trace_type(&mut self, trace_type: Option<TraceType>) {
        self.trace_type = trace_type;
    }
}
