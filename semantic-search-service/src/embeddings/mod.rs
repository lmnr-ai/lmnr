mod bm25;
mod cohere;
mod endpoint;

pub use bm25::*;
pub use cohere::*;
pub use endpoint::*;

use anyhow::Result;
use enum_dispatch::enum_dispatch;
use serde::Deserialize;

#[derive(Deserialize, Debug)]
pub struct Embedding {
    pub vector: Vec<f32>,
    pub sparse_indices: Option<Vec<u32>>,
}

#[enum_dispatch(Embed)]
pub enum EmbeddingModel {
    Cohere(Cohere),
    Bm25(Bm25),
}

#[enum_dispatch]
pub trait Embed {
    async fn embed(&self, inputs: Vec<String>, is_query: bool) -> Result<Vec<Embedding>>;
}
