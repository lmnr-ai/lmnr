mod engine;
mod json_walker;
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
use crate::json_walker::{apply_spans_and_serialize, build_skip_keys, walk_and_render};
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

    /// Tokens per inference window. Long inputs are sliced into overlapping
    /// windows of this size.
    #[arg(long, env = "PII_CHUNK_SIZE", default_value_t = 512)]
    chunk_size: usize,

    /// Tokens of overlap between adjacent windows. Sized to cover the
    /// longest expected PII entity so chunk boundaries don't fragment one.
    #[arg(long, env = "PII_CHUNK_OVERLAP", default_value_t = 64)]
    chunk_overlap: usize,

    /// Per-text hard cap. Inputs whose tokenisation exceeds this are
    /// rejected with RESOURCE_EXHAUSTED. Bounds worst-case per-text compute.
    #[arg(long, env = "PII_MAX_TOKENS_PER_TEXT", default_value_t = 24_576)]
    max_tokens_per_text: usize,

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
    max_tokens_per_text: usize,
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

        let skip_keys = build_skip_keys(&req.skip_keys);

        // Stage 1: parse + walk + render each input. Reject any text whose
        // rendered tokenisation exceeds the per-text cap so we never commit
        // to chunked inference we won't return from in bounded time.
        let mut walked = Vec::with_capacity(req.texts.len());
        let mut rendered = Vec::with_capacity(req.texts.len());
        for (i, text) in req.texts.into_iter().enumerate() {
            let w = walk_and_render(&text, &skip_keys).map_err(|e| {
                Status::invalid_argument(format!("texts[{i}]: {e:#}"))
            })?;
            let tokens = self.engine.count_tokens(&w.rendered).map_err(|e| {
                Status::internal(format!("texts[{i}]: counting tokens: {e:#}"))
            })?;
            if tokens > self.max_tokens_per_text {
                return Err(Status::resource_exhausted(format!(
                    "texts[{i}]: rendered content is {tokens} tokens, exceeds PII_MAX_TOKENS_PER_TEXT ({})",
                    self.max_tokens_per_text
                )));
            }
            rendered.push(w.rendered.clone());
            walked.push(w);
        }

        // Stage 2: detect spans in the rendered text for each input
        // (concurrent across inputs, chunked per-input if needed).
        let engine = self.engine.clone();
        let all_spans = engine
            .detect_spans_batch(rendered)
            .await
            .map_err(|e| Status::internal(format!("detect failed: {e:#}")))?;

        // Stage 3: route spans → leaves → rewrite tree → serialize.
        let mut out_texts = Vec::with_capacity(walked.len());
        for (i, (w, spans)) in walked.into_iter().zip(all_spans.into_iter()).enumerate() {
            let s = apply_spans_and_serialize(w, spans, &placeholder).map_err(|e| {
                Status::internal(format!("texts[{i}]: serializing redacted output: {e:#}"))
            })?;
            out_texts.push(s);
        }

        Ok(Response::new(RedactResponse { texts: out_texts }))
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
        chunk_size: args.chunk_size,
        chunk_overlap: args.chunk_overlap,
        intra_threads: args.intra_threads,
        inter_threads: args.inter_threads,
        num_sessions: args.num_sessions.max(1),
    };
    // `max_batch_size` is plumbed through CLI for forward-compat; not yet
    // used by the chunked single-text inference path.
    let _ = args.max_batch_size;
    let engine = Engine::load(cfg)?;

    let addr = format!("0.0.0.0:{}", args.port).parse()?;
    let svc = PiiRedactorServiceServer::new(GrpcServer {
        engine,
        max_texts_per_request: args.max_texts_per_request,
        max_tokens_per_text: args.max_tokens_per_text,
    });

    info!("listening on {addr}");
    if let Err(e) = Server::builder().add_service(svc).serve(addr).await {
        error!("server error: {e:#}");
        return Err(e.into());
    }
    Ok(())
}
