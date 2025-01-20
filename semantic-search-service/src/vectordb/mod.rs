use std::collections::HashMap;

use anyhow::Result;
use chrono::Utc;
use prost_types::Timestamp;
use qdrant_client::{
    qdrant::{
        vectors_config::Config, Condition, CreateCollection, CreateFieldIndexCollectionBuilder,
        DatetimeRange, DeletePointsBuilder, Distance, FieldType, Filter, HnswConfigDiff,
        PointStruct, SearchPoints, SearchResponse, SparseIndexConfig, SparseIndices,
        SparseVectorConfig, SparseVectorParams, UpsertPointsBuilder, VectorParams, VectorsConfig,
    },
    Qdrant,
};

use crate::{
    embeddings::Embedding,
    semantic_search::semantic_search_grpc::{DateRanges, Model},
};

pub struct QdrantClient {
    client: Qdrant,
}

const SPARSE_INDEX_FULL_SCAN_THRESHOLD: u64 = 500;

impl Model {
    fn dimensions(&self) -> u64 {
        match self {
            Model::GteBase => 768,
            Model::CohereMultilingual => 1024,
            Model::Bm25 => 1024,
        }
    }

    fn id(&self) -> u64 {
        match self {
            Model::GteBase => 0,
            Model::CohereMultilingual => 1,
            Model::Bm25 => 2,
        }
    }
}

impl QdrantClient {
    pub fn new(url: &str) -> Self {
        let client = Qdrant::from_url(url).build().unwrap();
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
        if !self.client.collection_exists(collection_id.clone()).await? {
            self.create_collection(collection_name, model).await?;
        }

        self.client
            .upsert_points(UpsertPointsBuilder::new(collection_id, points).build())
            .await?;

        Ok(())
    }

    pub async fn delete_points(
        &self,
        collection_name: &str,
        model: &Model,
        payloads: Vec<HashMap<String, String>>,
    ) -> Result<()> {
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

        let points_filter = Filter::any(payload_conditions);

        self.client
            .delete_points(
                DeletePointsBuilder::new(collection_id)
                    .points(points_filter)
                    .build(),
            )
            .await?;

        Ok(())
    }

    /// Searches points for a given vector, where any of the payloads fully match
    pub async fn search_points(
        &self,
        embedding: &Embedding,
        collection_name: &str,
        model: &Model,
        limit: u64,
        threshold: f32,
        payloads: Vec<HashMap<String, String>>,
        date_ranges: Option<DateRanges>,
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

        let date_range_filter: Option<Condition> = date_ranges.map(|date_ranges| {
            let date_range_conditions: Vec<Condition> = date_ranges
                .date_ranges
                .iter()
                .map(|date_range| {
                    let condition = Condition::datetime_range(
                        date_range.key.clone(),
                        DatetimeRange {
                            gte: Some(Timestamp {
                                seconds: date_range.gte.unwrap().seconds,
                                nanos: date_range.gte.unwrap().nanos,
                            }),
                            lte: Some(Timestamp {
                                seconds: date_range
                                    .lte
                                    .map_or(Utc::now().timestamp(), |lte| lte.seconds),
                                nanos: date_range.lte.map_or(0, |lte| lte.nanos),
                            }),
                            ..Default::default()
                        },
                    );
                    condition
                })
                .collect();
            Filter::any(date_range_conditions).into()
        });

        let filter = if let Some(date_range_filter) = date_range_filter {
            Filter::all(vec![
                Filter::any(payload_conditions).into(),
                date_range_filter,
            ])
        } else {
            Filter::any(payload_conditions)
        };

        let search_points = SearchPoints {
            collection_name: collection_id,
            vector: embedding.vector.clone(),
            filter: Some(filter),
            limit: limit as u64,
            with_payload: Some(true.into()),
            score_threshold: Some(threshold),
            vector_name: embedding
                .sparse_indices
                .as_ref()
                .map(|_| "sparse".to_string()),
            sparse_indices: embedding
                .sparse_indices
                .as_ref()
                .map(|sparse_indices| SparseIndices {
                    data: sparse_indices.clone(),
                }),
            ..Default::default()
        };

        let response = self.client.search_points(search_points).await?;

        Ok(response)
    }

    pub async fn create_collection(&self, collection_name: &str, model: &Model) -> Result<()> {
        let dim = model.dimensions();

        let collection_id = collection_id(collection_name, model);

        let sparse_vectors_config = if model.sparse() {
            Some(SparseVectorConfig {
                map: HashMap::from([(
                    "sparse".to_string(),
                    SparseVectorParams {
                        index: Some(SparseIndexConfig {
                            on_disk: Some(true),
                            full_scan_threshold: Some(SPARSE_INDEX_FULL_SCAN_THRESHOLD),
                            ..Default::default()
                        }),
                        modifier: Some(0),
                    },
                )]),
            })
        } else {
            None
        };

        // TODO: set on_disk to be configurable based on user tier, OR
        // keep a separate "warm" collection for the first N 15 minutes and
        // manage it
        self.client
            .create_collection(CreateCollection {
                collection_name: collection_id.clone(),
                vectors_config: Some(VectorsConfig {
                    config: Some(Config::Params(VectorParams {
                        size: dim,
                        distance: Distance::Cosine.into(),
                        on_disk: Some(true),
                        ..Default::default()
                    })),
                }),
                hnsw_config: Some(HnswConfigDiff {
                    m: Some(0),
                    payload_m: Some(16),
                    on_disk: Some(true),
                    ..Default::default()
                }),
                sparse_vectors_config,
                ..Default::default()
            })
            .await?;

        self.client
            .create_field_index(
                CreateFieldIndexCollectionBuilder::new(
                    collection_id.clone(),
                    "datasource_id",
                    FieldType::Keyword,
                )
                .build(),
            )
            .await?;

        Ok(())
    }

    pub async fn delete_collections(&self, collection_name: &str) -> Result<()> {
        for model in [&Model::GteBase, &Model::CohereMultilingual, &Model::Bm25] {
            let id = collection_id(collection_name, &model);
            self.client.delete_collection(id.clone()).await?;
        }

        Ok(())
    }
}

fn collection_id(collection_name: &str, model: &Model) -> String {
    format!("{}_{}", collection_name, model.id())
}
