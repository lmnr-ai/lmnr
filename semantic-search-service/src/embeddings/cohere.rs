use anyhow::{Ok, Result};
use serde::{Deserialize, Serialize};
use tokio::task;
use futures::future::join_all;

use super::{Embed, Embedding, Endpoint};

pub struct Cohere {
    endpoint: Endpoint,
    model: CohereEmbeddingModel,
}

#[derive(Serialize)]
struct CohereRequest {
    model: String,
    input_type: String,
    texts: Vec<String>,
    // truncate: String,
}

pub enum CohereEmbeddingModel {
    EmbedMultilingualV3,
}

impl CohereEmbeddingModel {
    fn to_string(&self) -> String {
        match self {
            CohereEmbeddingModel::EmbedMultilingualV3 => "embed-multilingual-v3.0".to_string(),
        }
    }
}

#[derive(Deserialize)]
struct CohereResponse {
    embeddings: Vec<Embedding>,
}

impl Cohere {
    pub fn new(endpoint: Endpoint, model: CohereEmbeddingModel) -> Self {
        Self { endpoint, model }
    }
}

impl Embed for Cohere {
    async fn embed(&self, inputs: Vec<String>, is_query: bool) -> Result<Vec<Embedding>> {
        // call endpoint in batches of 96
        let mut embeddings: Vec<Embedding> = Vec::new();
        let mut tasks = Vec::new();

        let input_type = if is_query {
            "search_query".to_string()
        } else {
            "search_document".to_string()
        };

        for chunk in inputs.chunks(96) {
            let model = self.model.to_string();
            let input_type = input_type.clone();
            let texts = chunk.to_vec();
            let endpoint = self.endpoint.clone();

            let task = task::spawn(async move {
                let body = CohereRequest {
                    model,
                    input_type,
                    texts,
                };
    
                let body = serde_json::to_string(&body).unwrap();
                let res = endpoint.call::<CohereResponse>(body).await?;

                Ok(res.embeddings)
            });

            tasks.push(task);
        }

        let results = join_all(tasks).await;
        for res in results {
            embeddings.extend(res??);
        }

        Ok(embeddings)
    }
}
