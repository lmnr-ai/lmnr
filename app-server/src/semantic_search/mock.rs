use std::collections::HashMap;

use anyhow::Result;
use async_trait::async_trait;

use super::semantic_search_grpc::{
    index_request::Datapoint, CalculateSimilarityScoresResponse, CreateCollectionResponse,
    DateRanges, DeleteCollectionsResponse, DeleteEmbeddingsResponse, IndexResponse, QueryResponse,
};

use super::SemanticSearch;

#[derive(Clone)]
pub struct MockSemanticSearch {}

#[async_trait]
impl SemanticSearch for MockSemanticSearch {
    async fn query(
        &self,
        _: &str,
        _: String,
        _: u32,
        _: f32,
        _: Vec<HashMap<String, String>>,
        _: Option<DateRanges>,
        _: bool,
    ) -> Result<QueryResponse> {
        Ok(QueryResponse::default())
    }

    async fn delete_embeddings(
        &self,
        _: &str,
        _: Vec<HashMap<String, String>>,
    ) -> Result<DeleteEmbeddingsResponse> {
        Ok(DeleteEmbeddingsResponse::default())
    }

    async fn index(&self, _: Vec<Datapoint>, _: String, _: bool) -> Result<IndexResponse> {
        Ok(IndexResponse::default())
    }

    async fn create_collection(&self, _: String, _: bool) -> Result<CreateCollectionResponse> {
        Ok(CreateCollectionResponse::default())
    }

    async fn delete_collections(&self, _: String) -> Result<DeleteCollectionsResponse> {
        Ok(DeleteCollectionsResponse::default())
    }

    async fn calculate_similarity_scores(
        &self,
        _: Vec<String>,
        _: Vec<String>,
    ) -> Result<CalculateSimilarityScoresResponse> {
        Ok(CalculateSimilarityScoresResponse::default())
    }
}
