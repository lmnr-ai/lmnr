use std::{collections::HashMap, sync::Arc};

use anyhow::Result;
use async_trait::async_trait;
use tonic::{transport::Channel, Request};

use super::semantic_search_grpc::{
    calculate_similarity_scores_request::ComparedContents, index_request::Datapoint,
    semantic_search_client::SemanticSearchClient, CalculateSimilarityScoresRequest,
    CalculateSimilarityScoresResponse, CreateCollectionRequest, CreateCollectionResponse,
    DeleteCollectionsRequest, DeleteCollectionsResponse, DeleteEmbeddingsRequest,
    DeleteEmbeddingsResponse, IndexRequest, IndexResponse, Model, QueryRequest, QueryResponse,
    RequestPayload,
};

use crate::semantic_search::SemanticSearchTrait;

#[derive(Clone, Debug)]
pub struct SemanticSearchImpl {
    client: Arc<SemanticSearchClient<Channel>>,
}

impl SemanticSearchImpl {
    pub fn new(client: Arc<SemanticSearchClient<Channel>>) -> Self {
        Self { client }
    }
}

#[async_trait]
impl SemanticSearchTrait for SemanticSearchImpl {
    async fn query(
        &self,
        collection_name: &str,
        query: String,
        limit: u32,
        threshold: f32,
        payloads: Vec<HashMap<String, String>>,
    ) -> Result<QueryResponse> {
        let mut client = self.client.as_ref().clone();

        let req_payloads = payloads
            .into_iter()
            .map(|payload| RequestPayload { payload })
            .collect();

        let request = Request::new(QueryRequest {
            query,
            limit,
            threshold,
            collection_name: collection_name.to_string(),
            model: Model::CohereMultilingual.into(),
            payloads: req_payloads,
        });
        let response = client.query(request).await?;

        Ok(response.into_inner())
    }

    async fn delete_embeddings(
        &self,
        collection_name: &str,
        payloads: Vec<HashMap<String, String>>,
    ) -> Result<DeleteEmbeddingsResponse> {
        let mut client = self.client.as_ref().clone();

        let req_payloads = payloads
            .into_iter()
            .map(|payload| RequestPayload { payload })
            .collect();
        let request = Request::new(DeleteEmbeddingsRequest {
            collection_name: collection_name.to_string(),
            model: Model::CohereMultilingual.into(),
            payloads: req_payloads,
        });
        let response = client.delete_embeddings(request).await?;

        Ok(response.into_inner())
    }

    async fn index(
        &self,
        datapoints: Vec<Datapoint>,
        collection_name: String,
    ) -> Result<IndexResponse> {
        let mut client = self.client.as_ref().clone();
        let request = Request::new(IndexRequest {
            datapoints,
            model: Model::CohereMultilingual.into(),
            collection_name,
        });
        let response = client.index(request).await?;

        Ok(response.into_inner())
    }

    async fn create_collection(&self, collection_name: String) -> Result<CreateCollectionResponse> {
        let mut client = self.client.as_ref().clone();
        let request = Request::new(CreateCollectionRequest {
            collection_name,
            model: Model::CohereMultilingual.into(),
        });

        let response = client.create_collection(request).await?;

        Ok(response.into_inner())
    }

    async fn delete_collections(
        &self,
        collection_name: String,
    ) -> Result<DeleteCollectionsResponse> {
        let mut client = self.client.as_ref().clone();
        let request = Request::new(DeleteCollectionsRequest { collection_name });

        let response = client.delete_collections(request).await?;

        Ok(response.into_inner())
    }

    async fn calculate_similarity_scores(
        &self,
        first: Vec<String>,
        second: Vec<String>,
    ) -> Result<CalculateSimilarityScoresResponse> {
        let mut client = self.client.as_ref().clone();
        let request = Request::new(CalculateSimilarityScoresRequest {
            model: Model::CohereMultilingual.into(),
            contents: first
                .into_iter()
                .zip(second)
                .map(|(first_item, second_item)| ComparedContents {
                    first: first_item,
                    second: second_item,
                })
                .collect(),
        });

        let response = client.calculate_similarity_scores(request).await?;

        Ok(response.into_inner())
    }
}
