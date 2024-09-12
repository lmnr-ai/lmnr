use serde::Deserialize;

pub mod events;
pub mod modifiers;
pub mod spans;
pub mod utils;

#[derive(Deserialize, Debug)]
pub enum Aggregation {
    Total,
    Average,
}

impl Aggregation {
    pub fn to_ch_agg_function<'a>(&'a self) -> &'a str {
        match self {
            Aggregation::Total => "SUM",
            Aggregation::Average => "AVG",
        }
    }
}
