// This file is @generated by prost-build.
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct IndexRequest {
    #[prost(message, repeated, tag = "1")]
    pub datapoints: ::prost::alloc::vec::Vec<index_request::Datapoint>,
    #[prost(string, tag = "2")]
    pub collection_name: ::prost::alloc::string::String,
    #[prost(enumeration = "Model", tag = "3")]
    pub model: i32,
}
/// Nested message and enum types in `IndexRequest`.
pub mod index_request {
    #[derive(Clone, PartialEq, ::prost::Message)]
    pub struct Datapoint {
        #[prost(string, tag = "1")]
        pub content: ::prost::alloc::string::String,
        #[prost(string, tag = "2")]
        pub datasource_id: ::prost::alloc::string::String,
        #[prost(map = "string, string", tag = "3")]
        pub data: ::std::collections::HashMap<
            ::prost::alloc::string::String,
            ::prost::alloc::string::String,
        >,
        #[prost(string, tag = "4")]
        pub id: ::prost::alloc::string::String,
    }
}
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct IndexResponse {
    #[prost(string, tag = "1")]
    pub status: ::prost::alloc::string::String,
}
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct DeleteEmbeddingsRequest {
    #[prost(message, repeated, tag = "1")]
    pub payloads: ::prost::alloc::vec::Vec<RequestPayload>,
    #[prost(string, tag = "2")]
    pub collection_name: ::prost::alloc::string::String,
    #[prost(enumeration = "Model", tag = "3")]
    pub model: i32,
}
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct DeleteEmbeddingsResponse {
    #[prost(string, tag = "1")]
    pub status: ::prost::alloc::string::String,
}
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct RequestPayload {
    #[prost(map = "string, string", tag = "1")]
    pub payload: ::std::collections::HashMap<
        ::prost::alloc::string::String,
        ::prost::alloc::string::String,
    >,
}
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct QueryRequest {
    #[prost(string, tag = "1")]
    pub query: ::prost::alloc::string::String,
    #[prost(uint32, tag = "2")]
    pub limit: u32,
    #[prost(float, tag = "3")]
    pub threshold: f32,
    #[prost(message, repeated, tag = "4")]
    pub payloads: ::prost::alloc::vec::Vec<RequestPayload>,
    #[prost(string, tag = "5")]
    pub collection_name: ::prost::alloc::string::String,
    #[prost(enumeration = "Model", tag = "6")]
    pub model: i32,
}
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct QueryResponse {
    #[prost(message, repeated, tag = "1")]
    pub results: ::prost::alloc::vec::Vec<query_response::QueryPoint>,
}
/// Nested message and enum types in `QueryResponse`.
pub mod query_response {
    #[derive(Clone, PartialEq, ::prost::Message)]
    pub struct QueryPoint {
        #[prost(float, tag = "1")]
        pub score: f32,
        #[prost(string, tag = "2")]
        pub datapoint_id: ::prost::alloc::string::String,
        #[prost(string, tag = "3")]
        pub datasource_id: ::prost::alloc::string::String,
        #[prost(map = "string, string", tag = "4")]
        pub data: ::std::collections::HashMap<
            ::prost::alloc::string::String,
            ::prost::alloc::string::String,
        >,
    }
}
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct GenerateEmbeddingsRequest {
    #[prost(string, repeated, tag = "1")]
    pub contents: ::prost::alloc::vec::Vec<::prost::alloc::string::String>,
    #[prost(enumeration = "Model", tag = "2")]
    pub model: i32,
}
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct GenerateEmbeddingsResponse {
    #[prost(message, repeated, tag = "1")]
    pub embeddings: ::prost::alloc::vec::Vec<generate_embeddings_response::Embeddings>,
}
/// Nested message and enum types in `GenerateEmbeddingsResponse`.
pub mod generate_embeddings_response {
    #[derive(Clone, PartialEq, ::prost::Message)]
    pub struct Embeddings {
        #[prost(float, repeated, tag = "1")]
        pub values: ::prost::alloc::vec::Vec<f32>,
    }
}
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct CalculateSimilarityScoresRequest {
    #[prost(message, repeated, tag = "1")]
    pub contents: ::prost::alloc::vec::Vec<
        calculate_similarity_scores_request::ComparedContents,
    >,
    #[prost(enumeration = "Model", tag = "2")]
    pub model: i32,
}
/// Nested message and enum types in `CalculateSimilarityScoresRequest`.
pub mod calculate_similarity_scores_request {
    #[derive(Clone, PartialEq, ::prost::Message)]
    pub struct ComparedContents {
        #[prost(string, tag = "1")]
        pub first: ::prost::alloc::string::String,
        #[prost(string, tag = "2")]
        pub second: ::prost::alloc::string::String,
    }
}
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct CalculateSimilarityScoresResponse {
    #[prost(float, repeated, tag = "1")]
    pub scores: ::prost::alloc::vec::Vec<f32>,
}
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct CreateCollectionRequest {
    #[prost(string, tag = "1")]
    pub collection_name: ::prost::alloc::string::String,
    #[prost(enumeration = "Model", tag = "2")]
    pub model: i32,
}
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct CreateCollectionResponse {
    #[prost(string, tag = "1")]
    pub status: ::prost::alloc::string::String,
}
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct DeleteCollectionsRequest {
    #[prost(string, tag = "1")]
    pub collection_name: ::prost::alloc::string::String,
}
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct DeleteCollectionsResponse {
    #[prost(string, tag = "1")]
    pub status: ::prost::alloc::string::String,
}
/// When new model is added, don't forget to modify delete_collections function accordingly
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord, ::prost::Enumeration)]
#[repr(i32)]
pub enum Model {
    GteBase = 0,
    CohereMultilingual = 1,
    Bm25 = 2,
}
impl Model {
    /// String value of the enum field names used in the ProtoBuf definition.
    ///
    /// The values are not transformed in any way and thus are considered stable
    /// (if the ProtoBuf definition does not change) and safe for programmatic use.
    pub fn as_str_name(&self) -> &'static str {
        match self {
            Self::GteBase => "GTE_BASE",
            Self::CohereMultilingual => "COHERE_MULTILINGUAL",
            Self::Bm25 => "BM25",
        }
    }
    /// Creates an enum from field names used in the ProtoBuf definition.
    pub fn from_str_name(value: &str) -> ::core::option::Option<Self> {
        match value {
            "GTE_BASE" => Some(Self::GteBase),
            "COHERE_MULTILINGUAL" => Some(Self::CohereMultilingual),
            "BM25" => Some(Self::Bm25),
            _ => None,
        }
    }
}
/// Generated client implementations.
pub mod semantic_search_client {
    #![allow(
        unused_variables,
        dead_code,
        missing_docs,
        clippy::wildcard_imports,
        clippy::let_unit_value,
    )]
    use tonic::codegen::*;
    use tonic::codegen::http::Uri;
    #[derive(Debug, Clone)]
    pub struct SemanticSearchClient<T> {
        inner: tonic::client::Grpc<T>,
    }
    impl SemanticSearchClient<tonic::transport::Channel> {
        /// Attempt to create a new client by connecting to a given endpoint.
        pub async fn connect<D>(dst: D) -> Result<Self, tonic::transport::Error>
        where
            D: TryInto<tonic::transport::Endpoint>,
            D::Error: Into<StdError>,
        {
            let conn = tonic::transport::Endpoint::new(dst)?.connect().await?;
            Ok(Self::new(conn))
        }
    }
    impl<T> SemanticSearchClient<T>
    where
        T: tonic::client::GrpcService<tonic::body::BoxBody>,
        T::Error: Into<StdError>,
        T::ResponseBody: Body<Data = Bytes> + std::marker::Send + 'static,
        <T::ResponseBody as Body>::Error: Into<StdError> + std::marker::Send,
    {
        pub fn new(inner: T) -> Self {
            let inner = tonic::client::Grpc::new(inner);
            Self { inner }
        }
        pub fn with_origin(inner: T, origin: Uri) -> Self {
            let inner = tonic::client::Grpc::with_origin(inner, origin);
            Self { inner }
        }
        pub fn with_interceptor<F>(
            inner: T,
            interceptor: F,
        ) -> SemanticSearchClient<InterceptedService<T, F>>
        where
            F: tonic::service::Interceptor,
            T::ResponseBody: Default,
            T: tonic::codegen::Service<
                http::Request<tonic::body::BoxBody>,
                Response = http::Response<
                    <T as tonic::client::GrpcService<tonic::body::BoxBody>>::ResponseBody,
                >,
            >,
            <T as tonic::codegen::Service<
                http::Request<tonic::body::BoxBody>,
            >>::Error: Into<StdError> + std::marker::Send + std::marker::Sync,
        {
            SemanticSearchClient::new(InterceptedService::new(inner, interceptor))
        }
        /// Compress requests with the given encoding.
        ///
        /// This requires the server to support it otherwise it might respond with an
        /// error.
        #[must_use]
        pub fn send_compressed(mut self, encoding: CompressionEncoding) -> Self {
            self.inner = self.inner.send_compressed(encoding);
            self
        }
        /// Enable decompressing responses.
        #[must_use]
        pub fn accept_compressed(mut self, encoding: CompressionEncoding) -> Self {
            self.inner = self.inner.accept_compressed(encoding);
            self
        }
        /// Limits the maximum size of a decoded message.
        ///
        /// Default: `4MB`
        #[must_use]
        pub fn max_decoding_message_size(mut self, limit: usize) -> Self {
            self.inner = self.inner.max_decoding_message_size(limit);
            self
        }
        /// Limits the maximum size of an encoded message.
        ///
        /// Default: `usize::MAX`
        #[must_use]
        pub fn max_encoding_message_size(mut self, limit: usize) -> Self {
            self.inner = self.inner.max_encoding_message_size(limit);
            self
        }
        /// Embeds datapoints and adds them to the storage.
        pub async fn index(
            &mut self,
            request: impl tonic::IntoRequest<super::IndexRequest>,
        ) -> std::result::Result<tonic::Response<super::IndexResponse>, tonic::Status> {
            self.inner
                .ready()
                .await
                .map_err(|e| {
                    tonic::Status::unknown(
                        format!("Service was not ready: {}", e.into()),
                    )
                })?;
            let codec = tonic::codec::ProstCodec::default();
            let path = http::uri::PathAndQuery::from_static(
                "/semantic_search_grpc.SemanticSearch/Index",
            );
            let mut req = request.into_request();
            req.extensions_mut()
                .insert(GrpcMethod::new("semantic_search_grpc.SemanticSearch", "Index"));
            self.inner.unary(req, path, codec).await
        }
        /// Deletes the embeddings
        pub async fn delete_embeddings(
            &mut self,
            request: impl tonic::IntoRequest<super::DeleteEmbeddingsRequest>,
        ) -> std::result::Result<
            tonic::Response<super::DeleteEmbeddingsResponse>,
            tonic::Status,
        > {
            self.inner
                .ready()
                .await
                .map_err(|e| {
                    tonic::Status::unknown(
                        format!("Service was not ready: {}", e.into()),
                    )
                })?;
            let codec = tonic::codec::ProstCodec::default();
            let path = http::uri::PathAndQuery::from_static(
                "/semantic_search_grpc.SemanticSearch/DeleteEmbeddings",
            );
            let mut req = request.into_request();
            req.extensions_mut()
                .insert(
                    GrpcMethod::new(
                        "semantic_search_grpc.SemanticSearch",
                        "DeleteEmbeddings",
                    ),
                );
            self.inner.unary(req, path, codec).await
        }
        /// Queries the index for similar text.
        pub async fn query(
            &mut self,
            request: impl tonic::IntoRequest<super::QueryRequest>,
        ) -> std::result::Result<tonic::Response<super::QueryResponse>, tonic::Status> {
            self.inner
                .ready()
                .await
                .map_err(|e| {
                    tonic::Status::unknown(
                        format!("Service was not ready: {}", e.into()),
                    )
                })?;
            let codec = tonic::codec::ProstCodec::default();
            let path = http::uri::PathAndQuery::from_static(
                "/semantic_search_grpc.SemanticSearch/Query",
            );
            let mut req = request.into_request();
            req.extensions_mut()
                .insert(GrpcMethod::new("semantic_search_grpc.SemanticSearch", "Query"));
            self.inner.unary(req, path, codec).await
        }
        /// Creates a new collection.
        pub async fn create_collection(
            &mut self,
            request: impl tonic::IntoRequest<super::CreateCollectionRequest>,
        ) -> std::result::Result<
            tonic::Response<super::CreateCollectionResponse>,
            tonic::Status,
        > {
            self.inner
                .ready()
                .await
                .map_err(|e| {
                    tonic::Status::unknown(
                        format!("Service was not ready: {}", e.into()),
                    )
                })?;
            let codec = tonic::codec::ProstCodec::default();
            let path = http::uri::PathAndQuery::from_static(
                "/semantic_search_grpc.SemanticSearch/CreateCollection",
            );
            let mut req = request.into_request();
            req.extensions_mut()
                .insert(
                    GrpcMethod::new(
                        "semantic_search_grpc.SemanticSearch",
                        "CreateCollection",
                    ),
                );
            self.inner.unary(req, path, codec).await
        }
        /// Delete collection.
        pub async fn delete_collections(
            &mut self,
            request: impl tonic::IntoRequest<super::DeleteCollectionsRequest>,
        ) -> std::result::Result<
            tonic::Response<super::DeleteCollectionsResponse>,
            tonic::Status,
        > {
            self.inner
                .ready()
                .await
                .map_err(|e| {
                    tonic::Status::unknown(
                        format!("Service was not ready: {}", e.into()),
                    )
                })?;
            let codec = tonic::codec::ProstCodec::default();
            let path = http::uri::PathAndQuery::from_static(
                "/semantic_search_grpc.SemanticSearch/DeleteCollections",
            );
            let mut req = request.into_request();
            req.extensions_mut()
                .insert(
                    GrpcMethod::new(
                        "semantic_search_grpc.SemanticSearch",
                        "DeleteCollections",
                    ),
                );
            self.inner.unary(req, path, codec).await
        }
        /// Generates embeddings for provided texts
        pub async fn generate_embeddings(
            &mut self,
            request: impl tonic::IntoRequest<super::GenerateEmbeddingsRequest>,
        ) -> std::result::Result<
            tonic::Response<super::GenerateEmbeddingsResponse>,
            tonic::Status,
        > {
            self.inner
                .ready()
                .await
                .map_err(|e| {
                    tonic::Status::unknown(
                        format!("Service was not ready: {}", e.into()),
                    )
                })?;
            let codec = tonic::codec::ProstCodec::default();
            let path = http::uri::PathAndQuery::from_static(
                "/semantic_search_grpc.SemanticSearch/GenerateEmbeddings",
            );
            let mut req = request.into_request();
            req.extensions_mut()
                .insert(
                    GrpcMethod::new(
                        "semantic_search_grpc.SemanticSearch",
                        "GenerateEmbeddings",
                    ),
                );
            self.inner.unary(req, path, codec).await
        }
        /// Calculate similarity score for pairs of texts
        pub async fn calculate_similarity_scores(
            &mut self,
            request: impl tonic::IntoRequest<super::CalculateSimilarityScoresRequest>,
        ) -> std::result::Result<
            tonic::Response<super::CalculateSimilarityScoresResponse>,
            tonic::Status,
        > {
            self.inner
                .ready()
                .await
                .map_err(|e| {
                    tonic::Status::unknown(
                        format!("Service was not ready: {}", e.into()),
                    )
                })?;
            let codec = tonic::codec::ProstCodec::default();
            let path = http::uri::PathAndQuery::from_static(
                "/semantic_search_grpc.SemanticSearch/CalculateSimilarityScores",
            );
            let mut req = request.into_request();
            req.extensions_mut()
                .insert(
                    GrpcMethod::new(
                        "semantic_search_grpc.SemanticSearch",
                        "CalculateSimilarityScores",
                    ),
                );
            self.inner.unary(req, path, codec).await
        }
    }
}
