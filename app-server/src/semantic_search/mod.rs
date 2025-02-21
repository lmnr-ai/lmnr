use std::collections::HashMap;

use anyhow::Result;
use async_trait::async_trait;
use enum_dispatch::enum_dispatch;

use self::semantic_search_grpc::{
    index_request::Datapoint, CalculateSimilarityScoresResponse, CreateCollectionResponse,
    DeleteCollectionsResponse, DeleteEmbeddingsResponse, IndexResponse, QueryResponse,
};

use mock::MockSemanticSearch;
use semantic_search_impl::SemanticSearchImpl;

pub mod mock;
pub mod semantic_search_grpc;
pub mod semantic_search_impl;
pub mod utils;

#[enum_dispatch]
pub enum SemanticSearch {
    Grpc(SemanticSearchImpl),
    Mock(MockSemanticSearch),
}

#[async_trait]
#[enum_dispatch(SemanticSearch)]
pub trait SemanticSearchTrait {
    async fn query(
        &self,
        collection_name: &str,
        query: String,
        limit: u32,
        threshold: f32,
        payloads: Vec<HashMap<String, String>>,
    ) -> Result<QueryResponse>;

    async fn delete_embeddings(
        &self,
        collection_name: &str,
        payloads: Vec<HashMap<String, String>>,
    ) -> Result<DeleteEmbeddingsResponse>;

    async fn index(
        &self,
        datapoints: Vec<Datapoint>,
        collection_name: String,
    ) -> Result<IndexResponse>;

    async fn create_collection(&self, collection_name: String) -> Result<CreateCollectionResponse>;

    async fn delete_collections(
        &self,
        collection_name: String,
    ) -> Result<DeleteCollectionsResponse>;

    async fn calculate_similarity_scores(
        &self,
        first: Vec<String>,
        second: Vec<String>,
    ) -> Result<CalculateSimilarityScoresResponse>;
}
