#[allow(clippy::derive_partial_eq_without_eq)]
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
    #[allow(clippy::derive_partial_eq_without_eq)]
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
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct IndexResponse {
    #[prost(string, tag = "1")]
    pub status: ::prost::alloc::string::String,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct DeleteEmbeddingsRequest {
    #[prost(message, repeated, tag = "1")]
    pub payloads: ::prost::alloc::vec::Vec<RequestPayload>,
    #[prost(string, tag = "2")]
    pub collection_name: ::prost::alloc::string::String,
    #[prost(enumeration = "Model", tag = "3")]
    pub model: i32,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct DeleteEmbeddingsResponse {
    #[prost(string, tag = "1")]
    pub status: ::prost::alloc::string::String,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct RequestPayload {
    #[prost(map = "string, string", tag = "1")]
    pub payload: ::std::collections::HashMap<
        ::prost::alloc::string::String,
        ::prost::alloc::string::String,
    >,
}
#[allow(clippy::derive_partial_eq_without_eq)]
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
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct QueryResponse {
    #[prost(message, repeated, tag = "1")]
    pub results: ::prost::alloc::vec::Vec<query_response::QueryPoint>,
}
/// Nested message and enum types in `QueryResponse`.
pub mod query_response {
    #[allow(clippy::derive_partial_eq_without_eq)]
    #[derive(Clone, PartialEq, ::prost::Message)]
    pub struct QueryPoint {
        #[prost(float, tag = "1")]
        pub score: f32,
        #[prost(string, tag = "2")]
        pub content: ::prost::alloc::string::String,
        #[prost(string, tag = "3")]
        pub datasource_id: ::prost::alloc::string::String,
        #[prost(map = "string, string", tag = "4")]
        pub data: ::std::collections::HashMap<
            ::prost::alloc::string::String,
            ::prost::alloc::string::String,
        >,
    }
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct GenerateEmbeddingsRequest {
    #[prost(string, repeated, tag = "1")]
    pub contents: ::prost::alloc::vec::Vec<::prost::alloc::string::String>,
    #[prost(enumeration = "Model", tag = "2")]
    pub model: i32,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct GenerateEmbeddingsResponse {
    #[prost(message, repeated, tag = "1")]
    pub embeddings: ::prost::alloc::vec::Vec<generate_embeddings_response::Embeddings>,
}
/// Nested message and enum types in `GenerateEmbeddingsResponse`.
pub mod generate_embeddings_response {
    #[allow(clippy::derive_partial_eq_without_eq)]
    #[derive(Clone, PartialEq, ::prost::Message)]
    pub struct Embeddings {
        #[prost(float, repeated, tag = "1")]
        pub values: ::prost::alloc::vec::Vec<f32>,
    }
}
#[allow(clippy::derive_partial_eq_without_eq)]
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
    #[allow(clippy::derive_partial_eq_without_eq)]
    #[derive(Clone, PartialEq, ::prost::Message)]
    pub struct ComparedContents {
        #[prost(string, tag = "1")]
        pub first: ::prost::alloc::string::String,
        #[prost(string, tag = "2")]
        pub second: ::prost::alloc::string::String,
    }
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct CalculateSimilarityScoresResponse {
    #[prost(float, repeated, tag = "1")]
    pub scores: ::prost::alloc::vec::Vec<f32>,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct CreateCollectionRequest {
    #[prost(string, tag = "1")]
    pub collection_name: ::prost::alloc::string::String,
    #[prost(enumeration = "Model", tag = "2")]
    pub model: i32,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct CreateCollectionResponse {
    #[prost(string, tag = "1")]
    pub status: ::prost::alloc::string::String,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct DeleteCollectionsRequest {
    #[prost(string, tag = "1")]
    pub collection_name: ::prost::alloc::string::String,
}
#[allow(clippy::derive_partial_eq_without_eq)]
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
}
impl Model {
    /// String value of the enum field names used in the ProtoBuf definition.
    ///
    /// The values are not transformed in any way and thus are considered stable
    /// (if the ProtoBuf definition does not change) and safe for programmatic use.
    pub fn as_str_name(&self) -> &'static str {
        match self {
            Model::GteBase => "GTE_BASE",
            Model::CohereMultilingual => "COHERE_MULTILINGUAL",
        }
    }
    /// Creates an enum from field names used in the ProtoBuf definition.
    pub fn from_str_name(value: &str) -> ::core::option::Option<Self> {
        match value {
            "GTE_BASE" => Some(Self::GteBase),
            "COHERE_MULTILINGUAL" => Some(Self::CohereMultilingual),
            _ => None,
        }
    }
}
/// Generated client implementations.
pub mod semantic_search_client {
    #![allow(unused_variables, dead_code, missing_docs, clippy::let_unit_value)]
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
            D: std::convert::TryInto<tonic::transport::Endpoint>,
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
        T::ResponseBody: Body<Data = Bytes> + Send + 'static,
        <T::ResponseBody as Body>::Error: Into<StdError> + Send,
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
            >>::Error: Into<StdError> + Send + Sync,
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
        /// Embeds datapoints and adds them to the storage.
        pub async fn index(
            &mut self,
            request: impl tonic::IntoRequest<super::IndexRequest>,
        ) -> Result<tonic::Response<super::IndexResponse>, tonic::Status> {
            self.inner
                .ready()
                .await
                .map_err(|e| {
                    tonic::Status::new(
                        tonic::Code::Unknown,
                        format!("Service was not ready: {}", e.into()),
                    )
                })?;
            let codec = tonic::codec::ProstCodec::default();
            let path = http::uri::PathAndQuery::from_static(
                "/semantic_search_grpc.SemanticSearch/Index",
            );
            self.inner.unary(request.into_request(), path, codec).await
        }
        /// Deletes the embeddings
        pub async fn delete_embeddings(
            &mut self,
            request: impl tonic::IntoRequest<super::DeleteEmbeddingsRequest>,
        ) -> Result<tonic::Response<super::DeleteEmbeddingsResponse>, tonic::Status> {
            self.inner
                .ready()
                .await
                .map_err(|e| {
                    tonic::Status::new(
                        tonic::Code::Unknown,
                        format!("Service was not ready: {}", e.into()),
                    )
                })?;
            let codec = tonic::codec::ProstCodec::default();
            let path = http::uri::PathAndQuery::from_static(
                "/semantic_search_grpc.SemanticSearch/DeleteEmbeddings",
            );
            self.inner.unary(request.into_request(), path, codec).await
        }
        /// Queries the index for similar text.
        pub async fn query(
            &mut self,
            request: impl tonic::IntoRequest<super::QueryRequest>,
        ) -> Result<tonic::Response<super::QueryResponse>, tonic::Status> {
            self.inner
                .ready()
                .await
                .map_err(|e| {
                    tonic::Status::new(
                        tonic::Code::Unknown,
                        format!("Service was not ready: {}", e.into()),
                    )
                })?;
            let codec = tonic::codec::ProstCodec::default();
            let path = http::uri::PathAndQuery::from_static(
                "/semantic_search_grpc.SemanticSearch/Query",
            );
            self.inner.unary(request.into_request(), path, codec).await
        }
        /// Creates a new collection.
        pub async fn create_collection(
            &mut self,
            request: impl tonic::IntoRequest<super::CreateCollectionRequest>,
        ) -> Result<tonic::Response<super::CreateCollectionResponse>, tonic::Status> {
            self.inner
                .ready()
                .await
                .map_err(|e| {
                    tonic::Status::new(
                        tonic::Code::Unknown,
                        format!("Service was not ready: {}", e.into()),
                    )
                })?;
            let codec = tonic::codec::ProstCodec::default();
            let path = http::uri::PathAndQuery::from_static(
                "/semantic_search_grpc.SemanticSearch/CreateCollection",
            );
            self.inner.unary(request.into_request(), path, codec).await
        }
        /// Delete collection.
        pub async fn delete_collections(
            &mut self,
            request: impl tonic::IntoRequest<super::DeleteCollectionsRequest>,
        ) -> Result<tonic::Response<super::DeleteCollectionsResponse>, tonic::Status> {
            self.inner
                .ready()
                .await
                .map_err(|e| {
                    tonic::Status::new(
                        tonic::Code::Unknown,
                        format!("Service was not ready: {}", e.into()),
                    )
                })?;
            let codec = tonic::codec::ProstCodec::default();
            let path = http::uri::PathAndQuery::from_static(
                "/semantic_search_grpc.SemanticSearch/DeleteCollections",
            );
            self.inner.unary(request.into_request(), path, codec).await
        }
        /// Generates embeddings for provided texts
        pub async fn generate_embeddings(
            &mut self,
            request: impl tonic::IntoRequest<super::GenerateEmbeddingsRequest>,
        ) -> Result<tonic::Response<super::GenerateEmbeddingsResponse>, tonic::Status> {
            self.inner
                .ready()
                .await
                .map_err(|e| {
                    tonic::Status::new(
                        tonic::Code::Unknown,
                        format!("Service was not ready: {}", e.into()),
                    )
                })?;
            let codec = tonic::codec::ProstCodec::default();
            let path = http::uri::PathAndQuery::from_static(
                "/semantic_search_grpc.SemanticSearch/GenerateEmbeddings",
            );
            self.inner.unary(request.into_request(), path, codec).await
        }
        /// Calculate similarity score for pairs of texts
        pub async fn calculate_similarity_scores(
            &mut self,
            request: impl tonic::IntoRequest<super::CalculateSimilarityScoresRequest>,
        ) -> Result<
            tonic::Response<super::CalculateSimilarityScoresResponse>,
            tonic::Status,
        > {
            self.inner
                .ready()
                .await
                .map_err(|e| {
                    tonic::Status::new(
                        tonic::Code::Unknown,
                        format!("Service was not ready: {}", e.into()),
                    )
                })?;
            let codec = tonic::codec::ProstCodec::default();
            let path = http::uri::PathAndQuery::from_static(
                "/semantic_search_grpc.SemanticSearch/CalculateSimilarityScores",
            );
            self.inner.unary(request.into_request(), path, codec).await
        }
    }
}
/// Generated server implementations.
pub mod semantic_search_server {
    #![allow(unused_variables, dead_code, missing_docs, clippy::let_unit_value)]
    use tonic::codegen::*;
    /// Generated trait containing gRPC methods that should be implemented for use with SemanticSearchServer.
    #[async_trait]
    pub trait SemanticSearch: Send + Sync + 'static {
        /// Embeds datapoints and adds them to the storage.
        async fn index(
            &self,
            request: tonic::Request<super::IndexRequest>,
        ) -> Result<tonic::Response<super::IndexResponse>, tonic::Status>;
        /// Deletes the embeddings
        async fn delete_embeddings(
            &self,
            request: tonic::Request<super::DeleteEmbeddingsRequest>,
        ) -> Result<tonic::Response<super::DeleteEmbeddingsResponse>, tonic::Status>;
        /// Queries the index for similar text.
        async fn query(
            &self,
            request: tonic::Request<super::QueryRequest>,
        ) -> Result<tonic::Response<super::QueryResponse>, tonic::Status>;
        /// Creates a new collection.
        async fn create_collection(
            &self,
            request: tonic::Request<super::CreateCollectionRequest>,
        ) -> Result<tonic::Response<super::CreateCollectionResponse>, tonic::Status>;
        /// Delete collection.
        async fn delete_collections(
            &self,
            request: tonic::Request<super::DeleteCollectionsRequest>,
        ) -> Result<tonic::Response<super::DeleteCollectionsResponse>, tonic::Status>;
        /// Generates embeddings for provided texts
        async fn generate_embeddings(
            &self,
            request: tonic::Request<super::GenerateEmbeddingsRequest>,
        ) -> Result<tonic::Response<super::GenerateEmbeddingsResponse>, tonic::Status>;
        /// Calculate similarity score for pairs of texts
        async fn calculate_similarity_scores(
            &self,
            request: tonic::Request<super::CalculateSimilarityScoresRequest>,
        ) -> Result<
            tonic::Response<super::CalculateSimilarityScoresResponse>,
            tonic::Status,
        >;
    }
    #[derive(Debug)]
    pub struct SemanticSearchServer<T: SemanticSearch> {
        inner: _Inner<T>,
        accept_compression_encodings: EnabledCompressionEncodings,
        send_compression_encodings: EnabledCompressionEncodings,
    }
    struct _Inner<T>(Arc<T>);
    impl<T: SemanticSearch> SemanticSearchServer<T> {
        pub fn new(inner: T) -> Self {
            Self::from_arc(Arc::new(inner))
        }
        pub fn from_arc(inner: Arc<T>) -> Self {
            let inner = _Inner(inner);
            Self {
                inner,
                accept_compression_encodings: Default::default(),
                send_compression_encodings: Default::default(),
            }
        }
        pub fn with_interceptor<F>(
            inner: T,
            interceptor: F,
        ) -> InterceptedService<Self, F>
        where
            F: tonic::service::Interceptor,
        {
            InterceptedService::new(Self::new(inner), interceptor)
        }
        /// Enable decompressing requests with the given encoding.
        #[must_use]
        pub fn accept_compressed(mut self, encoding: CompressionEncoding) -> Self {
            self.accept_compression_encodings.enable(encoding);
            self
        }
        /// Compress responses with the given encoding, if the client supports it.
        #[must_use]
        pub fn send_compressed(mut self, encoding: CompressionEncoding) -> Self {
            self.send_compression_encodings.enable(encoding);
            self
        }
    }
    impl<T, B> tonic::codegen::Service<http::Request<B>> for SemanticSearchServer<T>
    where
        T: SemanticSearch,
        B: Body + Send + 'static,
        B::Error: Into<StdError> + Send + 'static,
    {
        type Response = http::Response<tonic::body::BoxBody>;
        type Error = std::convert::Infallible;
        type Future = BoxFuture<Self::Response, Self::Error>;
        fn poll_ready(
            &mut self,
            _cx: &mut Context<'_>,
        ) -> Poll<Result<(), Self::Error>> {
            Poll::Ready(Ok(()))
        }
        fn call(&mut self, req: http::Request<B>) -> Self::Future {
            let inner = self.inner.clone();
            match req.uri().path() {
                "/semantic_search_grpc.SemanticSearch/Index" => {
                    #[allow(non_camel_case_types)]
                    struct IndexSvc<T: SemanticSearch>(pub Arc<T>);
                    impl<
                        T: SemanticSearch,
                    > tonic::server::UnaryService<super::IndexRequest> for IndexSvc<T> {
                        type Response = super::IndexResponse;
                        type Future = BoxFuture<
                            tonic::Response<Self::Response>,
                            tonic::Status,
                        >;
                        fn call(
                            &mut self,
                            request: tonic::Request<super::IndexRequest>,
                        ) -> Self::Future {
                            let inner = self.0.clone();
                            let fut = async move { (*inner).index(request).await };
                            Box::pin(fut)
                        }
                    }
                    let accept_compression_encodings = self.accept_compression_encodings;
                    let send_compression_encodings = self.send_compression_encodings;
                    let inner = self.inner.clone();
                    let fut = async move {
                        let inner = inner.0;
                        let method = IndexSvc(inner);
                        let codec = tonic::codec::ProstCodec::default();
                        let mut grpc = tonic::server::Grpc::new(codec)
                            .apply_compression_config(
                                accept_compression_encodings,
                                send_compression_encodings,
                            );
                        let res = grpc.unary(method, req).await;
                        Ok(res)
                    };
                    Box::pin(fut)
                }
                "/semantic_search_grpc.SemanticSearch/DeleteEmbeddings" => {
                    #[allow(non_camel_case_types)]
                    struct DeleteEmbeddingsSvc<T: SemanticSearch>(pub Arc<T>);
                    impl<
                        T: SemanticSearch,
                    > tonic::server::UnaryService<super::DeleteEmbeddingsRequest>
                    for DeleteEmbeddingsSvc<T> {
                        type Response = super::DeleteEmbeddingsResponse;
                        type Future = BoxFuture<
                            tonic::Response<Self::Response>,
                            tonic::Status,
                        >;
                        fn call(
                            &mut self,
                            request: tonic::Request<super::DeleteEmbeddingsRequest>,
                        ) -> Self::Future {
                            let inner = self.0.clone();
                            let fut = async move {
                                (*inner).delete_embeddings(request).await
                            };
                            Box::pin(fut)
                        }
                    }
                    let accept_compression_encodings = self.accept_compression_encodings;
                    let send_compression_encodings = self.send_compression_encodings;
                    let inner = self.inner.clone();
                    let fut = async move {
                        let inner = inner.0;
                        let method = DeleteEmbeddingsSvc(inner);
                        let codec = tonic::codec::ProstCodec::default();
                        let mut grpc = tonic::server::Grpc::new(codec)
                            .apply_compression_config(
                                accept_compression_encodings,
                                send_compression_encodings,
                            );
                        let res = grpc.unary(method, req).await;
                        Ok(res)
                    };
                    Box::pin(fut)
                }
                "/semantic_search_grpc.SemanticSearch/Query" => {
                    #[allow(non_camel_case_types)]
                    struct QuerySvc<T: SemanticSearch>(pub Arc<T>);
                    impl<
                        T: SemanticSearch,
                    > tonic::server::UnaryService<super::QueryRequest> for QuerySvc<T> {
                        type Response = super::QueryResponse;
                        type Future = BoxFuture<
                            tonic::Response<Self::Response>,
                            tonic::Status,
                        >;
                        fn call(
                            &mut self,
                            request: tonic::Request<super::QueryRequest>,
                        ) -> Self::Future {
                            let inner = self.0.clone();
                            let fut = async move { (*inner).query(request).await };
                            Box::pin(fut)
                        }
                    }
                    let accept_compression_encodings = self.accept_compression_encodings;
                    let send_compression_encodings = self.send_compression_encodings;
                    let inner = self.inner.clone();
                    let fut = async move {
                        let inner = inner.0;
                        let method = QuerySvc(inner);
                        let codec = tonic::codec::ProstCodec::default();
                        let mut grpc = tonic::server::Grpc::new(codec)
                            .apply_compression_config(
                                accept_compression_encodings,
                                send_compression_encodings,
                            );
                        let res = grpc.unary(method, req).await;
                        Ok(res)
                    };
                    Box::pin(fut)
                }
                "/semantic_search_grpc.SemanticSearch/CreateCollection" => {
                    #[allow(non_camel_case_types)]
                    struct CreateCollectionSvc<T: SemanticSearch>(pub Arc<T>);
                    impl<
                        T: SemanticSearch,
                    > tonic::server::UnaryService<super::CreateCollectionRequest>
                    for CreateCollectionSvc<T> {
                        type Response = super::CreateCollectionResponse;
                        type Future = BoxFuture<
                            tonic::Response<Self::Response>,
                            tonic::Status,
                        >;
                        fn call(
                            &mut self,
                            request: tonic::Request<super::CreateCollectionRequest>,
                        ) -> Self::Future {
                            let inner = self.0.clone();
                            let fut = async move {
                                (*inner).create_collection(request).await
                            };
                            Box::pin(fut)
                        }
                    }
                    let accept_compression_encodings = self.accept_compression_encodings;
                    let send_compression_encodings = self.send_compression_encodings;
                    let inner = self.inner.clone();
                    let fut = async move {
                        let inner = inner.0;
                        let method = CreateCollectionSvc(inner);
                        let codec = tonic::codec::ProstCodec::default();
                        let mut grpc = tonic::server::Grpc::new(codec)
                            .apply_compression_config(
                                accept_compression_encodings,
                                send_compression_encodings,
                            );
                        let res = grpc.unary(method, req).await;
                        Ok(res)
                    };
                    Box::pin(fut)
                }
                "/semantic_search_grpc.SemanticSearch/DeleteCollections" => {
                    #[allow(non_camel_case_types)]
                    struct DeleteCollectionsSvc<T: SemanticSearch>(pub Arc<T>);
                    impl<
                        T: SemanticSearch,
                    > tonic::server::UnaryService<super::DeleteCollectionsRequest>
                    for DeleteCollectionsSvc<T> {
                        type Response = super::DeleteCollectionsResponse;
                        type Future = BoxFuture<
                            tonic::Response<Self::Response>,
                            tonic::Status,
                        >;
                        fn call(
                            &mut self,
                            request: tonic::Request<super::DeleteCollectionsRequest>,
                        ) -> Self::Future {
                            let inner = self.0.clone();
                            let fut = async move {
                                (*inner).delete_collections(request).await
                            };
                            Box::pin(fut)
                        }
                    }
                    let accept_compression_encodings = self.accept_compression_encodings;
                    let send_compression_encodings = self.send_compression_encodings;
                    let inner = self.inner.clone();
                    let fut = async move {
                        let inner = inner.0;
                        let method = DeleteCollectionsSvc(inner);
                        let codec = tonic::codec::ProstCodec::default();
                        let mut grpc = tonic::server::Grpc::new(codec)
                            .apply_compression_config(
                                accept_compression_encodings,
                                send_compression_encodings,
                            );
                        let res = grpc.unary(method, req).await;
                        Ok(res)
                    };
                    Box::pin(fut)
                }
                "/semantic_search_grpc.SemanticSearch/GenerateEmbeddings" => {
                    #[allow(non_camel_case_types)]
                    struct GenerateEmbeddingsSvc<T: SemanticSearch>(pub Arc<T>);
                    impl<
                        T: SemanticSearch,
                    > tonic::server::UnaryService<super::GenerateEmbeddingsRequest>
                    for GenerateEmbeddingsSvc<T> {
                        type Response = super::GenerateEmbeddingsResponse;
                        type Future = BoxFuture<
                            tonic::Response<Self::Response>,
                            tonic::Status,
                        >;
                        fn call(
                            &mut self,
                            request: tonic::Request<super::GenerateEmbeddingsRequest>,
                        ) -> Self::Future {
                            let inner = self.0.clone();
                            let fut = async move {
                                (*inner).generate_embeddings(request).await
                            };
                            Box::pin(fut)
                        }
                    }
                    let accept_compression_encodings = self.accept_compression_encodings;
                    let send_compression_encodings = self.send_compression_encodings;
                    let inner = self.inner.clone();
                    let fut = async move {
                        let inner = inner.0;
                        let method = GenerateEmbeddingsSvc(inner);
                        let codec = tonic::codec::ProstCodec::default();
                        let mut grpc = tonic::server::Grpc::new(codec)
                            .apply_compression_config(
                                accept_compression_encodings,
                                send_compression_encodings,
                            );
                        let res = grpc.unary(method, req).await;
                        Ok(res)
                    };
                    Box::pin(fut)
                }
                "/semantic_search_grpc.SemanticSearch/CalculateSimilarityScores" => {
                    #[allow(non_camel_case_types)]
                    struct CalculateSimilarityScoresSvc<T: SemanticSearch>(pub Arc<T>);
                    impl<
                        T: SemanticSearch,
                    > tonic::server::UnaryService<
                        super::CalculateSimilarityScoresRequest,
                    > for CalculateSimilarityScoresSvc<T> {
                        type Response = super::CalculateSimilarityScoresResponse;
                        type Future = BoxFuture<
                            tonic::Response<Self::Response>,
                            tonic::Status,
                        >;
                        fn call(
                            &mut self,
                            request: tonic::Request<
                                super::CalculateSimilarityScoresRequest,
                            >,
                        ) -> Self::Future {
                            let inner = self.0.clone();
                            let fut = async move {
                                (*inner).calculate_similarity_scores(request).await
                            };
                            Box::pin(fut)
                        }
                    }
                    let accept_compression_encodings = self.accept_compression_encodings;
                    let send_compression_encodings = self.send_compression_encodings;
                    let inner = self.inner.clone();
                    let fut = async move {
                        let inner = inner.0;
                        let method = CalculateSimilarityScoresSvc(inner);
                        let codec = tonic::codec::ProstCodec::default();
                        let mut grpc = tonic::server::Grpc::new(codec)
                            .apply_compression_config(
                                accept_compression_encodings,
                                send_compression_encodings,
                            );
                        let res = grpc.unary(method, req).await;
                        Ok(res)
                    };
                    Box::pin(fut)
                }
                _ => {
                    Box::pin(async move {
                        Ok(
                            http::Response::builder()
                                .status(200)
                                .header("grpc-status", "12")
                                .header("content-type", "application/grpc")
                                .body(empty_body())
                                .unwrap(),
                        )
                    })
                }
            }
        }
    }
    impl<T: SemanticSearch> Clone for SemanticSearchServer<T> {
        fn clone(&self) -> Self {
            let inner = self.inner.clone();
            Self {
                inner,
                accept_compression_encodings: self.accept_compression_encodings,
                send_compression_encodings: self.send_compression_encodings,
            }
        }
    }
    impl<T: SemanticSearch> Clone for _Inner<T> {
        fn clone(&self) -> Self {
            Self(self.0.clone())
        }
    }
    impl<T: std::fmt::Debug> std::fmt::Debug for _Inner<T> {
        fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
            write!(f, "{:?}", self.0)
        }
    }
    impl<T: SemanticSearch> tonic::server::NamedService for SemanticSearchServer<T> {
        const NAME: &'static str = "semantic_search_grpc.SemanticSearch";
    }
}
