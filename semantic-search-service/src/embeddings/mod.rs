mod cohere;
mod endpoint;

pub use cohere::*;
pub use endpoint::*;

use anyhow::Result;
use enum_dispatch::enum_dispatch;
use serde::Deserialize;

#[derive(Deserialize, Debug)]
pub struct Embedding {
    pub vector: Vec<f32>,
}

#[enum_dispatch(Embed)]
pub enum EmbeddingModel {
    Cohere(Cohere),
}

#[enum_dispatch]
pub trait Embed {
    async fn embed(&self, inputs: Vec<String>, is_query: bool) -> Result<Vec<Embedding>>;
}
