use std::collections::HashMap;

use anyhow::Result;
use async_trait::async_trait;
use semantic_search_grpc::DateRanges;

use self::semantic_search_grpc::{
    index_request::Datapoint, CalculateSimilarityScoresResponse, CreateCollectionResponse,
    DeleteCollectionsResponse, DeleteEmbeddingsResponse, IndexResponse, QueryResponse,
};

pub mod mock;
pub mod semantic_search_grpc;
pub mod semantic_search_impl;
pub mod utils;

#[async_trait]
pub trait SemanticSearch: Sync + Send {
    async fn query(
        &self,
        collection_name: &str,
        query: String,
        limit: u32,
        threshold: f32,
        payloads: Vec<HashMap<String, String>>,
        date_ranges: Option<DateRanges>,
        sparse: bool,
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
        sparse: bool,
    ) -> Result<IndexResponse>;

    async fn create_collection(
        &self,
        collection_name: String,
        sparse: bool,
    ) -> Result<CreateCollectionResponse>;

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
