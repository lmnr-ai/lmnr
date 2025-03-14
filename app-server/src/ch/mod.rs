use clickhouse::Row;
use serde::{Deserialize, Serialize};

pub mod browser_events;
pub mod evaluation_scores;
pub mod events;
pub mod labels;
pub mod modifiers;
pub mod spans;
pub mod utils;

#[derive(Deserialize, Debug)]
pub enum Aggregation {
    Total,
    Average,
    Min,
    Max,
    Median,
    P90,
    P95,
    P99,
}

impl Aggregation {
    pub fn to_ch_agg_function<'a>(&'a self) -> &'a str {
        match self {
            Aggregation::Total => "SUM",
            Aggregation::Average => "AVG",
            Aggregation::Min => "MIN",
            Aggregation::Max => "MAX",
            Aggregation::Median => "median",
            Aggregation::P90 => "quantileExact(0.90)",
            Aggregation::P95 => "quantileExact(0.95)",
            Aggregation::P99 => "quantileExact(0.99)",
        }
    }

    pub fn to_string(&self) -> &str {
        match self {
            Aggregation::Total => "Total",
            Aggregation::Average => "Average",
            Aggregation::Min => "Min",
            Aggregation::Max => "Max",
            Aggregation::Median => "Median",
            Aggregation::P90 => "P90",
            Aggregation::P95 => "P95",
            Aggregation::P99 => "P99",
        }
    }
}

#[derive(Deserialize, Row, Serialize)]
pub struct MetricTimeValue<T> {
    pub time: u32,
    pub value: T,
}
