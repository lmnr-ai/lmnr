mod cohere;
mod endpoint;
use anyhow::Result;
use enum_dispatch::enum_dispatch;

pub use cohere::*;
pub use endpoint::*;
pub type Embedding = Vec<f32>;

#[enum_dispatch]
pub enum EmbeddingModel {
    Cohere(Cohere),
}

#[enum_dispatch(EmbeddingModel)]
pub trait Embed {
    async fn embed(&self, inputs: Vec<String>, is_query: bool) -> Result<Vec<Embedding>>;
}
