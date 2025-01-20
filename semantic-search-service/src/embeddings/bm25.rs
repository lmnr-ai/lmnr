use anyhow::Result;

use bm25::{DefaultTokenizer, Embedder, EmbedderBuilder, Embedding as Bm25Embedding};
use indexmap::IndexMap;

use super::{Embed, Embedding};

const DOCUMENT_LENGTH_TOKENS: f32 = 1024.0;

pub struct Bm25 {
    embedder: Embedder,
}

impl Bm25 {
    pub fn new() -> Self {
        let embedder = EmbedderBuilder::with_avgdl(DOCUMENT_LENGTH_TOKENS)
            .tokenizer(
                DefaultTokenizer::builder()
                    // normalize unicode characters, e.g. `é` -> `e`
                    .normalization(true)
                    // keep the stopwords
                    .stopwords(false)
                    // don't stem the words, i.e. `running` does not become `run`
                    .stemming(false)
                    .build(),
            )
            .build();
        Self { embedder }
    }
}

impl Embed for Bm25 {
    async fn embed(&self, inputs: Vec<String>, _is_query: bool) -> Result<Vec<Embedding>> {
        Ok(inputs
            .iter()
            .map(|input| {
                let Bm25Embedding(bm25_embedding) = self.embedder.embed(input);
                // Qdrant requires indices to be unique, so we need to deduplicate
                // TODO: figure out if IndexMap (sorted) is required, or if HashMap is enough
                let indices_to_vals = bm25_embedding
                    .iter()
                    .map(|embedding| (embedding.index, embedding.value))
                    .collect::<IndexMap<_, _>>();
                let indices = indices_to_vals.keys().cloned().collect::<Vec<_>>();
                let values = indices_to_vals.values().cloned().collect::<Vec<_>>();
                Embedding {
                    vector: values,
                    sparse_indices: Some(indices),
                }
            })
            .collect())
    }
}
