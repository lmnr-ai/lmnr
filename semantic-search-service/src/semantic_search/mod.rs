use chrono::Utc;
use log::error;
use qdrant_client::qdrant::{vector::Vector as InnerVector, NamedVectors, PointStruct, Vector};
use qdrant_client::qdrant::{DenseVector, SparseVector};
use qdrant_client::Payload;
use serde_json::json;
use simsimd::SpatialSimilarity;
use std::collections::HashMap;
use std::sync::Arc;
use tonic::{Request, Response, Status};
use uuid::Uuid;

use crate::embeddings::{Embed, Embedding, EmbeddingModel};
use crate::vectordb::QdrantClient;
use semantic_search_grpc::query_response::QueryPoint;
use semantic_search_grpc::semantic_search_server::SemanticSearch;
use semantic_search_grpc::{
    generate_embeddings_response, CalculateSimilarityScoresRequest,
    CalculateSimilarityScoresResponse, DeleteEmbeddingsRequest, DeleteEmbeddingsResponse,
    GenerateEmbeddingsRequest, GenerateEmbeddingsResponse, IndexRequest, IndexResponse,
    QueryRequest, QueryResponse,
};

use self::semantic_search_grpc::Model;

pub mod semantic_search_grpc;

pub struct SemanticSearchService {
    embedding_models: HashMap<Model, EmbeddingModel>,
    qdrant: Arc<QdrantClient>,
}

impl Model {
    pub fn from_int(model: i32) -> Model {
        match model {
            0 => Model::GteBase,
            1 => Model::CohereMultilingual,
            2 => Model::Bm25,
            _ => panic!("Unknown model"),
        }
    }

    pub fn sparse(&self) -> bool {
        match self {
            Model::GteBase => false,
            Model::CohereMultilingual => false,
            Model::Bm25 => true,
        }
    }
}

impl SemanticSearchService {
    pub fn new(
        embedding_models: HashMap<Model, EmbeddingModel>,
        qdrant: Arc<QdrantClient>,
    ) -> Self {
        Self {
            embedding_models,
            qdrant,
        }
    }
}

#[tonic::async_trait]
impl SemanticSearch for SemanticSearchService {
    async fn index(
        &self,
        request: Request<IndexRequest>,
    ) -> Result<Response<IndexResponse>, Status> {
        let message = request.into_inner();
        let model = Model::from_int(message.model);

        let inputs = message
            .datapoints
            .iter()
            .map(|datapoint| datapoint.content.to_string())
            .collect::<Vec<String>>();

        let embeddings = match self
            .embedding_models
            .get(&model)
            .expect("Failed to get model when indexing datapoints")
            .embed(inputs, false)
            .await
        {
            Ok(embeddings) => embeddings,
            Err(e) => {
                error!("{}", e);
                return Err(Status::internal(e.to_string()));
            }
        };

        let points: Vec<PointStruct> = embeddings
            .into_iter()
            .zip(message.datapoints.into_iter())
            .map(|(embedding, datapoint)| {
                let payload: Payload = json!({
                    "datasource_id": datapoint.datasource_id,
                    "data": datapoint.data,
                    "id": datapoint.id,
                    // qdrant allows seconds up to 10^-6 precision, so we could
                    // just rely on `json!` format, but it is safer to be explicit
                    "created_at": Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Micros, true)
                })
                .try_into()
                .unwrap();

                let point_id = if message.collection_name.starts_with("spans-") {
                    // Span ids are 8 byte-long, and thus far more likely to collide
                    // so we generate a new uuid for them
                    Uuid::new_v4().to_string()
                } else {
                    datapoint.id
                };
                if let Some(indices) = embedding.sparse_indices {
                    let vectors = NamedVectors {
                        vectors: HashMap::from([(
                            "sparse".to_string(),
                            Vector {
                                vector: Some(InnerVector::Sparse(SparseVector {
                                    values: embedding.vector,
                                    indices,
                                })),
                                ..Default::default()
                            },
                        )]),
                    };
                    PointStruct::new(point_id, vectors, payload)
                } else {
                    let vector = Vector {
                        vector: Some(InnerVector::Dense(DenseVector {
                            data: embedding.vector,
                        })),
                        ..Default::default()
                    };
                    PointStruct::new(point_id, vector, payload)
                }
            })
            .collect();

        match self
            .qdrant
            .add_points(&message.collection_name, &model, points)
            .await
        {
            Ok(_) => {
                let reply = IndexResponse {
                    status: "ok".to_string(),
                };
                Ok(Response::new(reply))
            }
            Err(e) => Err(Status::internal(e.to_string())),
        }
    }

    async fn delete_embeddings(
        &self,
        request: Request<DeleteEmbeddingsRequest>,
    ) -> Result<Response<DeleteEmbeddingsResponse>, Status> {
        let message = request.into_inner();

        let payloads = message
            .payloads
            .into_iter()
            .map(|payload| payload.payload)
            .collect();

        match self
            .qdrant
            .delete_points(
                &message.collection_name,
                &Model::from_int(message.model),
                payloads,
            )
            .await
        {
            Ok(_) => {
                let res = DeleteEmbeddingsResponse {
                    status: "ok".to_string(),
                };
                Ok(Response::new(res))
            }
            Err(e) => Err(Status::internal(e.to_string())),
        }
    }

    async fn query(
        &self,
        request: Request<QueryRequest>,
    ) -> Result<Response<QueryResponse>, Status> {
        let message = request.into_inner();
        let query = message.query;

        let embeddings: Vec<Embedding> = match self
            .embedding_models
            .get(&Model::from_int(message.model))
            .unwrap()
            .embed(vec![query], true)
            .await
        {
            Ok(embeddings) => embeddings,
            Err(e) => {
                error!("Error embedding queries: {}", e);
                return Err(Status::internal(e.to_string()));
            }
        };

        let embedding = if let Some(embedding) = embeddings.first() {
            embedding
        } else {
            return Err(Status::internal("No embeddings found"));
        };

        let payloads = message
            .payloads
            .into_iter()
            .map(|payload| payload.payload)
            .collect();
        let search_result = self
            .qdrant
            .search_points(
                embedding,
                &message.collection_name,
                &Model::from_int(message.model),
                message.limit as u64,
                message.threshold,
                payloads,
                message.date_ranges,
            )
            .await
            .unwrap();

        let results = search_result
            .result
            .iter()
            .map(|point| {
                let payload = point.payload.clone();

                // Note: this is our UUID v4 set by app-server. Qdrant also has point id
                // `ScoredPoint.id` but it's not used in the response.
                let datapoint_id = payload.get("id").unwrap().to_string();
                let datasource_id = payload.get("datasource_id").unwrap().to_string();
                let data = serde_json::from_value(payload.get("data").unwrap().clone().into_json())
                    .unwrap();

                QueryPoint {
                    score: point.score,
                    datapoint_id,
                    datasource_id,
                    data,
                }
            })
            .collect();

        Ok(Response::new(QueryResponse { results }))
    }

    async fn create_collection(
        &self,
        request: Request<semantic_search_grpc::CreateCollectionRequest>,
    ) -> Result<Response<semantic_search_grpc::CreateCollectionResponse>, Status> {
        let message = request.into_inner();
        let model = Model::from_int(message.model);

        match self
            .qdrant
            .create_collection(&message.collection_name, &model)
            .await
        {
            Ok(_) => {
                let reply = semantic_search_grpc::CreateCollectionResponse {
                    status: "ok".to_string(),
                };
                Ok(Response::new(reply))
            }
            Err(e) => {
                error!("Error creating collection: {}", e);
                Err(Status::internal(e.to_string()))
            }
        }
    }

    async fn delete_collections(
        &self,
        request: Request<semantic_search_grpc::DeleteCollectionsRequest>,
    ) -> Result<tonic::Response<semantic_search_grpc::DeleteCollectionsResponse>, Status> {
        let message = request.into_inner();
        match self
            .qdrant
            .delete_collections(&message.collection_name)
            .await
        {
            Ok(_) => {
                let reply = semantic_search_grpc::DeleteCollectionsResponse {
                    status: "ok".to_string(),
                };
                Ok(Response::new(reply))
            }
            Err(e) => {
                error!("Error deleting collections: {}", e);
                Err(Status::internal(e.to_string()))
            }
        }
    }

    async fn generate_embeddings(
        &self,
        request: Request<GenerateEmbeddingsRequest>,
    ) -> Result<Response<GenerateEmbeddingsResponse>, Status> {
        let message = request.into_inner();
        let model = Model::from_int(message.model);
        let contents = message.contents;

        if contents.is_empty() {
            return Err(Status::invalid_argument("contents cannot be empty"));
        }

        let embeddings = match self
            .embedding_models
            .get(&model)
            .expect("Failed to get model when generating embeddings")
            .embed(contents, false)
            .await
        {
            Ok(embeddings) => embeddings,
            Err(e) => {
                error!("{}", e);
                return Err(Status::internal(e.to_string()));
            }
        };

        return Ok(Response::new(GenerateEmbeddingsResponse {
            embeddings: embeddings
                .into_iter()
                .map(
                    |embedding_values| generate_embeddings_response::Embeddings {
                        values: embedding_values.vector.clone(),
                    },
                )
                .collect(),
        }));
    }

    async fn calculate_similarity_scores(
        &self,
        request: Request<CalculateSimilarityScoresRequest>,
    ) -> Result<Response<CalculateSimilarityScoresResponse>, tonic::Status> {
        let message = request.into_inner();
        let model = Model::from_int(message.model);
        let content_pairs = message.contents;

        if content_pairs.is_empty() {
            return Err(Status::invalid_argument("content pairs cannot be empty"));
        }

        let mut all_contents = Vec::new();
        for pair in content_pairs.iter() {
            all_contents.push(pair.first.clone());
            all_contents.push(pair.second.clone());
        }

        let embeddings = match self
            .embedding_models
            .get(&model)
            .expect("Failed to get model when calculating similarity scores")
            .embed(all_contents, false)
            .await
        {
            Ok(embeddings) => embeddings,
            Err(e) => {
                error!("{}", e);
                return Err(Status::internal(e.to_string()));
            }
        };

        let mut scores = Vec::new();

        for i in 0..embeddings.len() / 2 {
            let first = &embeddings[i * 2].vector;
            let second = &embeddings[i * 2 + 1].vector;

            // Calculate the distance with underlying SIMD implementation in C
            let score = match f32::cosine(first, second) {
                // Use abs to eliminate negative scores due to floating point errors when rounding near 0
                Some(s) => s.abs(),
                None => {
                    return Err(Status::internal(
                        "The embedding vectors are not of the same length.",
                    ));
                }
            };

            scores.push(1.0 - score);
        }

        return Ok(Response::new(CalculateSimilarityScoresResponse { scores }));
    }
}
