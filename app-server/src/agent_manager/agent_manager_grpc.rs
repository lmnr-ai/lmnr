// This file is @generated by prost-build.
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct LaminarSpanContext {
    #[prost(string, tag = "1")]
    pub trace_id: ::prost::alloc::string::String,
    #[prost(string, tag = "2")]
    pub span_id: ::prost::alloc::string::String,
    #[prost(bool, tag = "3")]
    pub is_remote: bool,
}
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct RunAgentRequest {
    #[prost(string, tag = "1")]
    pub prompt: ::prost::alloc::string::String,
    #[prost(string, tag = "2")]
    pub chat_id: ::prost::alloc::string::String,
    #[prost(string, optional, tag = "3")]
    pub request_api_key: ::core::option::Option<::prost::alloc::string::String>,
    #[prost(message, optional, tag = "4")]
    pub span_context: ::core::option::Option<LaminarSpanContext>,
    #[prost(enumeration = "ModelProvider", optional, tag = "5")]
    pub model_provider: ::core::option::Option<i32>,
    #[prost(string, optional, tag = "6")]
    pub model: ::core::option::Option<::prost::alloc::string::String>,
    #[prost(bool, optional, tag = "7")]
    pub enable_thinking: ::core::option::Option<bool>,
}
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct ActionResult {
    #[prost(bool, optional, tag = "1")]
    pub is_done: ::core::option::Option<bool>,
    #[prost(string, optional, tag = "2")]
    pub content: ::core::option::Option<::prost::alloc::string::String>,
    #[prost(string, optional, tag = "3")]
    pub error: ::core::option::Option<::prost::alloc::string::String>,
}
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct StepChunkContent {
    #[prost(message, optional, tag = "1")]
    pub action_result: ::core::option::Option<ActionResult>,
    #[prost(string, tag = "2")]
    pub summary: ::prost::alloc::string::String,
}
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct ChatMessage {
    #[prost(string, tag = "1")]
    pub role: ::prost::alloc::string::String,
    #[prost(string, optional, tag = "4")]
    pub name: ::core::option::Option<::prost::alloc::string::String>,
    #[prost(string, optional, tag = "5")]
    pub tool_call_id: ::core::option::Option<::prost::alloc::string::String>,
    #[prost(bool, optional, tag = "6")]
    pub is_state_message: ::core::option::Option<bool>,
    #[prost(oneof = "chat_message::Content", tags = "2, 3")]
    pub content: ::core::option::Option<chat_message::Content>,
}
/// Nested message and enum types in `ChatMessage`.
pub mod chat_message {
    #[derive(Clone, PartialEq, ::prost::Message)]
    pub struct ContentBlock {
        #[prost(oneof = "content_block::Content", tags = "1, 2")]
        pub content: ::core::option::Option<content_block::Content>,
    }
    /// Nested message and enum types in `ContentBlock`.
    pub mod content_block {
        #[derive(Clone, PartialEq, ::prost::Message)]
        pub struct TextContent {
            #[prost(string, tag = "1")]
            pub text: ::prost::alloc::string::String,
            #[prost(bool, optional, tag = "2")]
            pub cache_control: ::core::option::Option<bool>,
        }
        #[derive(Clone, PartialEq, ::prost::Message)]
        pub struct ImageContent {
            #[prost(bool, optional, tag = "3")]
            pub cache_control: ::core::option::Option<bool>,
            #[prost(oneof = "image_content::ImageSource", tags = "1, 2")]
            pub image_source: ::core::option::Option<image_content::ImageSource>,
        }
        /// Nested message and enum types in `ImageContent`.
        pub mod image_content {
            #[derive(Clone, PartialEq, ::prost::Oneof)]
            pub enum ImageSource {
                #[prost(string, tag = "1")]
                ImageB64(::prost::alloc::string::String),
                #[prost(string, tag = "2")]
                ImageUrl(::prost::alloc::string::String),
            }
        }
        #[derive(Clone, PartialEq, ::prost::Oneof)]
        pub enum Content {
            #[prost(message, tag = "1")]
            TextContent(TextContent),
            #[prost(message, tag = "2")]
            ImageContent(ImageContent),
        }
    }
    #[derive(Clone, PartialEq, ::prost::Message)]
    pub struct ContentList {
        #[prost(message, repeated, tag = "1")]
        pub content_blocks: ::prost::alloc::vec::Vec<ContentBlock>,
    }
    #[derive(Clone, PartialEq, ::prost::Oneof)]
    pub enum Content {
        #[prost(string, tag = "2")]
        RawText(::prost::alloc::string::String),
        #[prost(message, tag = "3")]
        ContentList(ContentList),
    }
}
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct AgentOutput {
    #[prost(message, optional, tag = "1")]
    pub agent_state: ::core::option::Option<AgentState>,
    #[prost(message, optional, tag = "2")]
    pub result: ::core::option::Option<ActionResult>,
}
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct BrowserState {
    #[prost(string, tag = "1")]
    pub url: ::prost::alloc::string::String,
    #[prost(message, repeated, tag = "2")]
    pub tabs: ::prost::alloc::vec::Vec<browser_state::TabInfo>,
    #[prost(string, optional, tag = "3")]
    pub screenshot_with_highlights: ::core::option::Option<
        ::prost::alloc::string::String,
    >,
    #[prost(string, optional, tag = "4")]
    pub screenshot: ::core::option::Option<::prost::alloc::string::String>,
    #[prost(int64, tag = "5")]
    pub pixels_above: i64,
    #[prost(int64, tag = "6")]
    pub pixels_below: i64,
    #[prost(map = "int64, message", tag = "7")]
    pub interactive_elements: ::std::collections::HashMap<
        i64,
        browser_state::InteractiveElement,
    >,
}
/// Nested message and enum types in `BrowserState`.
pub mod browser_state {
    #[derive(Clone, PartialEq, ::prost::Message)]
    pub struct TabInfo {
        #[prost(int64, tag = "1")]
        pub page_id: i64,
        #[prost(string, tag = "2")]
        pub url: ::prost::alloc::string::String,
        #[prost(string, tag = "3")]
        pub title: ::prost::alloc::string::String,
    }
    #[derive(Clone, PartialEq, ::prost::Message)]
    pub struct InteractiveElement {
        #[prost(int64, tag = "1")]
        pub index: i64,
        #[prost(string, tag = "2")]
        pub tag_name: ::prost::alloc::string::String,
        #[prost(string, tag = "3")]
        pub text: ::prost::alloc::string::String,
        #[prost(map = "string, string", tag = "4")]
        pub attributes: ::std::collections::HashMap<
            ::prost::alloc::string::String,
            ::prost::alloc::string::String,
        >,
        #[prost(message, optional, tag = "5")]
        pub viewport: ::core::option::Option<interactive_element::Coordinates>,
        #[prost(message, optional, tag = "6")]
        pub page: ::core::option::Option<interactive_element::Coordinates>,
        #[prost(message, optional, tag = "7")]
        pub center: ::core::option::Option<interactive_element::Coordinates>,
        #[prost(int64, tag = "8")]
        pub weight: i64,
        #[prost(string, tag = "9")]
        pub browser_agent_id: ::prost::alloc::string::String,
        #[prost(string, optional, tag = "10")]
        pub input_type: ::core::option::Option<::prost::alloc::string::String>,
    }
    /// Nested message and enum types in `InteractiveElement`.
    pub mod interactive_element {
        #[derive(Clone, Copy, PartialEq, ::prost::Message)]
        pub struct Coordinates {
            #[prost(int64, tag = "1")]
            pub x: i64,
            #[prost(int64, tag = "2")]
            pub y: i64,
            #[prost(int64, optional, tag = "3")]
            pub width: ::core::option::Option<i64>,
            #[prost(int64, optional, tag = "4")]
            pub height: ::core::option::Option<i64>,
        }
    }
}
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct AgentState {
    #[prost(message, repeated, tag = "1")]
    pub messages: ::prost::alloc::vec::Vec<ChatMessage>,
    #[prost(message, optional, tag = "2")]
    pub browser_state: ::core::option::Option<BrowserState>,
}
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct RunAgentResponseStreamChunk {
    #[prost(oneof = "run_agent_response_stream_chunk::ChunkType", tags = "1, 2")]
    pub chunk_type: ::core::option::Option<run_agent_response_stream_chunk::ChunkType>,
}
/// Nested message and enum types in `RunAgentResponseStreamChunk`.
pub mod run_agent_response_stream_chunk {
    #[derive(Clone, PartialEq, ::prost::Oneof)]
    pub enum ChunkType {
        #[prost(message, tag = "1")]
        StepChunkContent(super::StepChunkContent),
        #[prost(message, tag = "2")]
        AgentOutput(super::AgentOutput),
    }
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord, ::prost::Enumeration)]
#[repr(i32)]
pub enum ModelProvider {
    Anthropic = 0,
    Bedrock = 1,
}
impl ModelProvider {
    /// String value of the enum field names used in the ProtoBuf definition.
    ///
    /// The values are not transformed in any way and thus are considered stable
    /// (if the ProtoBuf definition does not change) and safe for programmatic use.
    pub fn as_str_name(&self) -> &'static str {
        match self {
            Self::Anthropic => "ANTHROPIC",
            Self::Bedrock => "BEDROCK",
        }
    }
    /// Creates an enum from field names used in the ProtoBuf definition.
    pub fn from_str_name(value: &str) -> ::core::option::Option<Self> {
        match value {
            "ANTHROPIC" => Some(Self::Anthropic),
            "BEDROCK" => Some(Self::Bedrock),
            _ => None,
        }
    }
}
/// Generated client implementations.
pub mod agent_manager_service_client {
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
    pub struct AgentManagerServiceClient<T> {
        inner: tonic::client::Grpc<T>,
    }
    impl AgentManagerServiceClient<tonic::transport::Channel> {
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
    impl<T> AgentManagerServiceClient<T>
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
        ) -> AgentManagerServiceClient<InterceptedService<T, F>>
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
            AgentManagerServiceClient::new(InterceptedService::new(inner, interceptor))
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
        pub async fn run_agent(
            &mut self,
            request: impl tonic::IntoRequest<super::RunAgentRequest>,
        ) -> std::result::Result<tonic::Response<super::AgentOutput>, tonic::Status> {
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
                "/agent_manager_grpc.AgentManagerService/RunAgent",
            );
            let mut req = request.into_request();
            req.extensions_mut()
                .insert(
                    GrpcMethod::new("agent_manager_grpc.AgentManagerService", "RunAgent"),
                );
            self.inner.unary(req, path, codec).await
        }
        pub async fn run_agent_stream(
            &mut self,
            request: impl tonic::IntoRequest<super::RunAgentRequest>,
        ) -> std::result::Result<
            tonic::Response<tonic::codec::Streaming<super::RunAgentResponseStreamChunk>>,
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
                "/agent_manager_grpc.AgentManagerService/RunAgentStream",
            );
            let mut req = request.into_request();
            req.extensions_mut()
                .insert(
                    GrpcMethod::new(
                        "agent_manager_grpc.AgentManagerService",
                        "RunAgentStream",
                    ),
                );
            self.inner.server_streaming(req, path, codec).await
        }
    }
}
