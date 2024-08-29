use std::collections::HashMap;

use anyhow::Result;
use qdrant_client::{
    prelude::*,
    qdrant::{
        vectors_config::Config, Condition, FieldType, Filter, HnswConfigDiff, PointsSelector, SearchResponse, VectorParams, VectorsConfig
    },
};

use crate::semantic_search::semantic_search_grpc::Model;

pub struct Qdrant {
    client: QdrantClient,
}

impl Model {
    fn dimensions(&self) -> u64 {
        match self {
            Model::GteBase => 768,
            Model::CohereMultilingual => 1024,
        }
    }

    fn id(&self) -> u64 {
        match self {
            Model::GteBase => 0,
            Model::CohereMultilingual => 1,
        }
    }
}

impl Qdrant {
    pub fn new(url: &str) -> Self {
        let client = QdrantClient::from_url(url).build().unwrap();
        Self { client }
    }

    pub async fn add_points(
        &self,
        collection_name: &str,
        model: &Model,
        points: Vec<PointStruct>,
    ) -> Result<()> {
        let collection_id = collection_id(collection_name, model);

        // hack to create project collection for old projects
        if !self.client.has_collection(collection_id.clone()).await? {
            self.create_collection(collection_name, model).await?;
        }

        self.client
            .upsert_points(collection_id, None, points, None)
            .await?;

        Ok(())
    }

    pub async fn delete_points(&self, collection_name: &str, model: &Model, payloads: Vec<HashMap<String, String>>) -> Result<()> {
        let collection_id = collection_id(collection_name, model);

        let payload_conditions: Vec<Condition> = payloads
            .iter()
            .map(|payload| {
                let mut must_conditions = Vec::new();
                for (key, value) in payload {
                    let condition = Condition::matches(key.clone(), value.clone());
                    must_conditions.push(condition);
                }
                let condition: Condition = Filter::all(must_conditions).into();
                condition
            })
            .collect();

        let points: PointsSelector = Filter::any(payload_conditions).into();

        self.client.delete_points(collection_id, None, &points, None).await?;

        Ok(())
    }

    /// Searches points for a given vector, where any of the payloads fully match
    pub async fn search_points(
        &self,
        vector: Vec<f32>,
        collection_name: &str,
        model: &Model,
        limit: u64,
        threshold: f32,
        payloads: Vec<HashMap<String, String>>,
    ) -> Result<SearchResponse> {
        let collection_id = collection_id(collection_name, model);

        let payload_conditions: Vec<Condition> = payloads
            .iter()
            .map(|payload| {
                let mut must_conditions = Vec::new();
                for (key, value) in payload {
                    let condition = Condition::matches(key.clone(), value.clone());
                    must_conditions.push(condition);
                }
                let condition: Condition = Filter::all(must_conditions).into();
                condition
            })
            .collect();

        let search_points = SearchPoints {
            collection_name: collection_id,
            vector,
            filter: Some(Filter::any(payload_conditions)),
            limit: limit as u64,
            with_payload: Some(true.into()),
            score_threshold: Some(threshold),
            ..Default::default()
        };

        let response = self.client.search_points(&search_points).await?;

        Ok(response)
    }

    pub async fn create_collection(&self, collection_name: &str, model: &Model) -> Result<()> {
        let dim = model.dimensions();

        let collection_id = collection_id(collection_name, model);

        self.client
            .create_collection(&CreateCollection {
                collection_name: collection_id.clone(),
                vectors_config: Some(VectorsConfig {
                    config: Some(Config::Params(VectorParams {
                        size: dim,
                        distance: Distance::Cosine.into(),
                        ..Default::default()
                    })),
                }),
                hnsw_config: Some(HnswConfigDiff {
                    m: Some(0),
                    payload_m: Some(16),
                    ..Default::default()
                }),
                ..Default::default()
            })
            .await?;

        self.client
            .create_field_index(
                collection_id.clone(),
                "datasource_id",
                FieldType::Keyword,
                None,
                None,
            )
            .await?;

        Ok(())
    }

    pub async fn delete_collections(&self, collection_name: &str) -> Result<()> {
        let id = collection_id(collection_name, &Model::GteBase);
        self.client.delete_collection(id.clone()).await?;

        let id = collection_id(collection_name, &Model::CohereMultilingual);
        self.client.delete_collection(id.clone()).await?;

        Ok(())
    }

}

fn collection_id(collection_name: &str, model: &Model) -> String {
    format!("{}_{}", collection_name, model.id())
}
