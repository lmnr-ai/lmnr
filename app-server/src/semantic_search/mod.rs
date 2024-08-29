use core::panic;
use std::{collections::HashMap, sync::Arc};

use anyhow::Result;
use semantic_search_grpc::semantic_search_client::SemanticSearchClient;
use tonic::{transport::Channel, Request};

use semantic_search_grpc::{
    index_request::Datapoint, IndexRequest, IndexResponse, QueryRequest, QueryResponse,
};

use crate::language_model::{ChatMessage, ChatMessageContent, ChatMessageContentPart};

use self::semantic_search_grpc::{
    calculate_similarity_scores_request::ComparedContents, CalculateSimilarityScoresRequest,
    CalculateSimilarityScoresResponse, CreateCollectionRequest, CreateCollectionResponse,
    DeleteCollectionsRequest, DeleteCollectionsResponse, DeleteEmbeddingsRequest,
    DeleteEmbeddingsResponse, Model, RequestPayload,
};

pub mod semantic_search_grpc;
pub mod utils;

#[derive(Clone, Debug)]
pub struct SemanticSearch {
    client: Arc<SemanticSearchClient<Channel>>,
}

impl SemanticSearch {
    pub fn new(client: Arc<SemanticSearchClient<Channel>>) -> Self {
        Self { client }
    }

    pub async fn query(
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

    pub async fn delete_embeddings(
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

    pub async fn index(
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

    pub async fn create_collection(
        &self,
        collection_name: String,
    ) -> Result<CreateCollectionResponse> {
        let mut client = self.client.as_ref().clone();
        let request = Request::new(CreateCollectionRequest {
            collection_name,
            model: Model::CohereMultilingual.into(),
        });

        let response = client.create_collection(request).await?;

        Ok(response.into_inner())
    }

    pub async fn delete_collections(
        &self,
        collection_name: String,
    ) -> Result<DeleteCollectionsResponse> {
        let mut client = self.client.as_ref().clone();
        let request = Request::new(DeleteCollectionsRequest { collection_name });

        let response = client.delete_collections(request).await?;

        Ok(response.into_inner())
    }

    pub async fn calculate_similatity_scores(
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

/// Merges chat messages into an embeddable string
///
/// Creates a string in the following format:
/// <role>:
/// <content>
/// ...
/// <role>:
/// <content>
///
/// This can be refactored to implement some trait Embeddable or something similar
pub fn merge_chat_messages(messages: &Vec<ChatMessage>) -> String {
    messages
        .iter()
        .map(|message| {
            // TODO: Remove all clones and make it more efficient
            let text_message = match &message.content {
                ChatMessageContent::Text(text) => text.clone(),
                ChatMessageContent::ContentPartList(parts) => parts
                    .iter()
                    .map(|part| match part {
                        ChatMessageContentPart::Text(text) => text.text.clone(),
                        _ => panic!("Expected text message"),
                    })
                    .collect::<Vec<String>>()
                    .join(""),
            };
            format!("{}:\n{}", message.role, text_message)
        })
        .collect::<Vec<String>>()
        .join("\n\n")
}
