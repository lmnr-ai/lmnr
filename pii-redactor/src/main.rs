mod engine;
mod labels;
mod proto;

use std::path::PathBuf;
use std::sync::Arc;

use anyhow::Result;
use clap::Parser;
use tonic::transport::Server;
use tonic::{Request, Response, Status};
use tracing::{error, info};
use tracing_subscriber::EnvFilter;

use crate::engine::{Engine, EngineConfig};
use crate::proto::pii_redactor_service_server::{PiiRedactorService, PiiRedactorServiceServer};
use crate::proto::{RedactRequest, RedactResponse};

const DEFAULT_PLACEHOLDER: &str = "[REDACTED_{LABEL}]";

#[derive(Debug, Parser)]
#[command(version, about = "PII redaction gRPC service")]
struct Args {
    #[arg(long, env = "PII_MODEL_DIR", default_value = "/models")]
    model_dir: PathBuf,

    #[arg(long, env = "PII_PORT", default_value_t = 8910)]
    port: u16,

    #[arg(long, env = "PII_MAX_SEQ_LEN", default_value_t = 512)]
    max_seq_len: usize,

    #[arg(long, env = "PII_MAX_BATCH_SIZE", default_value_t = 32)]
    max_batch_size: usize,

    /// Reject requests carrying more than this many texts in a single RPC.
    /// Guards against runaway memory allocation from a misbehaving client.
    #[arg(long, env = "PII_MAX_TEXTS_PER_REQUEST", default_value_t = 1024)]
    max_texts_per_request: usize,

    /// Threads for op-level parallelism inside one inference. 0 = ORT default.
    #[arg(long, env = "PII_INTRA_THREADS", default_value_t = 0)]
    intra_threads: usize,

    /// Threads for inter-op parallelism. Usually 1 is fine on CPU.
    #[arg(long, env = "PII_INTER_THREADS", default_value_t = 1)]
    inter_threads: usize,

    /// How many ORT sessions to spin up. Each handles one concurrent request.
    /// Default 1 — increase only if you can give each session its own cores.
    #[arg(long, env = "PII_NUM_SESSIONS", default_value_t = 1)]
    num_sessions: usize,
}

struct GrpcServer {
    engine: Arc<Engine>,
    max_texts_per_request: usize,
}

#[tonic::async_trait]
impl PiiRedactorService for GrpcServer {
    async fn redact(
        &self,
        request: Request<RedactRequest>,
    ) -> Result<Response<RedactResponse>, Status> {
        let req = request.into_inner();
        if req.texts.len() > self.max_texts_per_request {
            return Err(Status::resource_exhausted(format!(
                "texts length {} exceeds PII_MAX_TEXTS_PER_REQUEST ({})",
                req.texts.len(),
                self.max_texts_per_request
            )));
        }
        let placeholder = req
            .placeholder_format
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| DEFAULT_PLACEHOLDER.to_string());

        let texts = req.texts;
        let engine = self.engine.clone();
        let result = engine
            .redact(texts, placeholder)
            .await
            .map_err(|e| Status::internal(format!("redact failed: {e:#}")))?;

        Ok(Response::new(RedactResponse { texts: result }))
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    let args = Args::parse();
    info!(?args, "starting pii-redactor");

    let cfg = EngineConfig {
        model_dir: args.model_dir,
        max_seq_len: args.max_seq_len,
        max_batch_size: args.max_batch_size,
        intra_threads: args.intra_threads,
        inter_threads: args.inter_threads,
        num_sessions: args.num_sessions.max(1),
    };
    let engine = Engine::load(cfg)?;

    let addr = format!("0.0.0.0:{}", args.port).parse()?;
    let svc = PiiRedactorServiceServer::new(GrpcServer {
        engine,
        max_texts_per_request: args.max_texts_per_request,
    });

    info!("listening on {addr}");
    if let Err(e) = Server::builder().add_service(svc).serve(addr).await {
        error!("server error: {e:#}");
        return Err(e.into());
    }
    Ok(())
}
