use std::collections::HashMap;
use std::env;
use std::sync::Arc;

use dotenv;
use embeddings::EmbeddingModel;
use semantic_search::semantic_search_grpc::Model;
use tokio;
use tonic::transport::Server;

use semantic_search::semantic_search_grpc::semantic_search_server::SemanticSearchServer;
use semantic_search::SemanticSearchService;
use vectordb::Qdrant;

mod embeddings;
mod semantic_search;
mod vectordb;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenv::dotenv().ok();
    env_logger::init();

    let port = env::var("PORT").expect("PORT must be set");
    let address = format!("0.0.0.0:{}", port).parse().unwrap();

    // let model_path = Path::new("model/gte_base.onnx");
    // let tokenizer_path = Path::new("model/tokenizer.json");

    // let onnx = match Onnx::new(model_path, tokenizer_path) {
    //     Ok(onnx) => onnx,
    //     Err(e) => panic!("Error loading onnx model: {}", e),
    // };
    // let onnx = Arc::new(onnx);

    let qdrant_url = env::var("QDRANT_URL").expect("QDRANT_URL must be set");
    let qdrant = Arc::new(Qdrant::new(&qdrant_url));

    let client = reqwest::Client::new();

    let cohere_endpoint = env::var("COHERE_ENDPOINT").expect("COHERE_ENDPOINT must be set");
    let cohere_api_key = env::var("COHERE_API_KEY").expect("COHERE_API_KEY must be set");
    let cohere_multilingual_endpoint =
        embeddings::Endpoint::new(client.clone(), cohere_endpoint, cohere_api_key);
    let cohere_multilingual = embeddings::Cohere::new(
        cohere_multilingual_endpoint,
        embeddings::CohereEmbeddingModel::EmbedMultilingualV3,
    );

    let mut embedding_models: HashMap<Model, EmbeddingModel> = HashMap::new();
    // embedding_models.insert(Model::GteBase, onnx);
    embedding_models.insert(Model::CohereMultilingual, EmbeddingModel::Cohere(cohere_multilingual));

    let semantic_search_service = SemanticSearchService::new(embedding_models, qdrant);

    Server::builder()
        .add_service(SemanticSearchServer::new(semantic_search_service))
        .serve(address)
        .await?;
    Ok(())
}
