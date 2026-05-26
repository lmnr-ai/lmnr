//! ONNX Runtime inference engine for the privacy-filter token-classifier,
//! with a server-wide dynamic batcher.
//!
//! Throughput strategy
//! -------------------
//! BERT-family encoders on CPU are GEMM-dominated and memory-bandwidth-bound
//! at batch=1. Throughput on x86 (MLAS) typically scales 4-6x going from
//! batch=1 to batch=8 — the model literally cannot be busy on a single-text
//! `(1, L)` tensor. So the engine runs ONE shared session and feeds it
//! batched `(B, L)` tensors through a dedicated worker task. Every gRPC
//! handler tokenises its text, splits into windows if needed, ships each
//! window as a [`Job`] over an mpsc to the batcher, and awaits a per-job
//! oneshot. The batcher coalesces:
//!   - intra-RPC: all windows of one text become one `(N, L)` pass
//!   - cross-RPC: windows from concurrent RPCs ride the same `(B, L)` pass
//!     up to `max_batch_size` OR until `max_queue_delay` elapses (whichever
//!     comes first; classic dynamic-batching trade-off).
//!
//! Padding strategy: each batch pads to the longest window IN THE BATCH (not
//! to a global `chunk_size`), so a batch of mostly-short windows doesn't
//! waste compute. Sorting the queue by length before forming the batch keeps
//! padding waste low — short and long windows tend not to ride together.
//!
//! What the batcher does NOT do
//! ----------------------------
//! - vLLM-style PagedAttention / continuous batching: this is a pure
//!   encoder, no KV cache, no decode steps. Dynamic batching is the
//!   relevant analogue, not vLLM.
//! - Cross-batch coalescing of identical token sequences: not yet. Producer-
//!   side dedup upstream already drops duplicate `llm_messages.content`
//!   payloads, so the redactor sees mostly-distinct texts.

use std::collections::VecDeque;
use std::panic::AssertUnwindSafe;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use anyhow::{Context, Result, anyhow};
use ndarray::{Array2, ArrayView, Axis};
use ort::session::{Session, SessionInputValue, builder::GraphOptimizationLevel};
use ort::value::TensorRef;
use tokenizers::{Encoding, Tokenizer};
use tokio::sync::{mpsc, oneshot};

use crate::labels::LabelMap;

#[derive(Debug, Clone)]
pub struct EngineConfig {
    pub model_dir: PathBuf,
    /// Maximum tokens per inference window. Texts whose tokenisation exceeds
    /// this are sliced into overlapping windows.
    pub chunk_size: usize,
    /// Tokens of overlap between adjacent windows. Sized to cover the longest
    /// PII entity (names, emails, phones fit easily in 64; long secrets may
    /// need more).
    pub chunk_overlap: usize,
    pub intra_threads: usize,
    pub inter_threads: usize,
    /// Max windows in a single forward pass. Set to ~bandwidth-saturation
    /// point of the underlying CPU; on c8i.2xlarge fp32 BERT-base the curve
    /// flattens around 8-16.
    pub max_batch_size: usize,
    /// How long the batcher waits for a batch to fill before flushing what
    /// it has. Latency budget vs. throughput trade. Trace ingest is async,
    /// so we can spend tens of ms here without anyone noticing.
    pub max_queue_delay: Duration,
}

/// One detected PII span, in byte offsets of the input text.
#[derive(Debug, Clone)]
pub struct Span {
    pub start: usize,
    pub end: usize,
    pub label: String,
}

/// One tokenised window, ready for the batcher. The `encoding` keeps the
/// offsets table needed to map model token labels back to char ranges; the
/// `text_byte_offset` shifts those into the original full-text coordinate
/// system when the window came from a sliding-window split.
pub struct TokenizedWindow {
    encoding: Encoding,
    text_byte_offset: usize,
}

/// Internal batcher job: one window awaiting inference. The oneshot reply
/// carries the per-token argmax labels for that window's row of the
/// `(B, L, num_labels)` logits tensor — argmax happens inside the batcher
/// task so the post-process (BIOES decode + char-offset mapping) doesn't
/// hold up the GEMM thread.
struct Job {
    ids: Vec<u32>,
    mask: Vec<u32>,
    types: Vec<u32>,
    reply: oneshot::Sender<Result<Vec<u32>>>,
}

/// Bound the Job channel at this multiple of `max_batch_size`. Sustained
/// overload should backpressure gRPC handlers (their `send().await` parks)
/// rather than queue unbounded memory. 8 leaves room for a few batches in
/// flight at once without unbounded growth.
const JOB_CHANNEL_DEPTH_PER_BATCH: usize = 8;

pub struct Engine {
    tokenizer: Tokenizer,
    labels: LabelMap,
    cfg: EngineConfig,
    /// `chunk_size` minus the tokens the tokenizer adds when called with
    /// `add_special_tokens=true` (e.g. CLS/SEP for BERT-family models).
    /// Inference always re-encodes with special tokens, so the chunk
    /// decision must reserve room for them — feeding the model
    /// `chunk_size` content tokens would produce `chunk_size + overhead`
    /// inputs and overflow positional embeddings on models whose
    /// `max_position_embeddings` matches `chunk_size`.
    effective_chunk_size: usize,
    /// Bounded channel into the batcher worker. Cloned per submission;
    /// `send().await` parks under sustained overload so gRPC backpressure
    /// is automatic.
    job_tx: mpsc::Sender<Job>,
    /// Set to `false` if the batcher thread exits for any reason (clean
    /// shutdown, ORT panic, runtime drop). `is_healthy()` reads this; once
    /// it's `false`, every subsequent RPC will fail with "batcher channel
    /// closed", so the readiness probe should fail the pod and let k8s
    /// restart it. Without this signal, a panicked batcher would silently
    /// turn every `Redact` RPC into INTERNAL errors with no observable
    /// distinction from a transient model failure.
    batcher_alive: Arc<AtomicBool>,
}

impl Engine {
    pub fn load(cfg: EngineConfig) -> Result<Arc<Self>> {
        let tokenizer_path = cfg.model_dir.join("tokenizer.json");
        let model_path = cfg.model_dir.join("model.onnx");
        let config_path = cfg.model_dir.join("config.json");

        let tokenizer = Tokenizer::from_file(&tokenizer_path)
            .map_err(|e| anyhow!("loading tokenizer.json: {e}"))?;
        let labels = LabelMap::from_config_json(&config_path)?;

        // Probe the tokenizer for its per-encode special-token count so the
        // chunking math matches what the model actually sees at inference.
        let with_specials = tokenizer
            .encode("", true)
            .map_err(|e| anyhow!("probe tokenize with specials: {e}"))?
            .get_ids()
            .len();
        let without_specials = tokenizer
            .encode("", false)
            .map_err(|e| anyhow!("probe tokenize without specials: {e}"))?
            .get_ids()
            .len();
        let special_overhead = with_specials.saturating_sub(without_specials);
        if special_overhead >= cfg.chunk_size {
            return Err(anyhow!(
                "chunk_size ({}) must be > tokenizer special-token overhead ({})",
                cfg.chunk_size,
                special_overhead
            ));
        }
        let effective_chunk_size = cfg.chunk_size - special_overhead;
        if cfg.chunk_overlap >= effective_chunk_size {
            return Err(anyhow!(
                "chunk_overlap ({}) must be < chunk_size ({}) - special-token overhead ({})",
                cfg.chunk_overlap,
                cfg.chunk_size,
                special_overhead
            ));
        }
        if cfg.max_batch_size == 0 {
            return Err(anyhow!("max_batch_size must be >= 1"));
        }

        let _ = ort::init().commit();

        // One session, one worker thread. Multiple sessions on CPU just
        // contend for the same cores; maxing out one well-batched session
        // is faster than balancing across N.
        let mut builder = Session::builder()
            .map_err(|e| anyhow!("session builder: {e:#}"))?
            .with_optimization_level(GraphOptimizationLevel::Level3)
            .map_err(|e| anyhow!("set optimization level: {e:#}"))?;
        if cfg.intra_threads > 0 {
            builder = builder
                .with_intra_threads(cfg.intra_threads)
                .map_err(|e| anyhow!("set intra threads: {e:#}"))?;
        }
        if cfg.inter_threads > 0 {
            builder = builder
                .with_inter_threads(cfg.inter_threads)
                .map_err(|e| anyhow!("set inter threads: {e:#}"))?;
        }
        let session = builder
            .commit_from_file(&model_path)
            .with_context(|| format!("loading {}", model_path.display()))?;
        let needs_token_type_ids = session.inputs().iter().any(|i| i.name() == "token_type_ids");

        let max_batch_size = cfg.max_batch_size;
        let max_queue_delay = cfg.max_queue_delay;
        let (job_tx, job_rx) = mpsc::channel::<Job>(max_batch_size * JOB_CHANNEL_DEPTH_PER_BATCH);

        // Build the single-thread runtime BEFORE spawning so any failure
        // (extremely rare in practice) surfaces in `Engine::load` instead
        // of silently killing the spawned thread.
        let batcher_runtime = tokio::runtime::Builder::new_current_thread()
            .enable_time()
            .build()
            .map_err(|e| anyhow!("build batcher runtime: {e:#}"))?;

        let batcher_alive = Arc::new(AtomicBool::new(true));
        let batcher_alive_for_thread = batcher_alive.clone();

        // Spawn the batcher on a dedicated OS thread (NOT a Tokio task) — ORT
        // session.run blocks the thread for tens of ms; running it in a
        // tokio task would stall every other future on that worker.
        std::thread::Builder::new()
            .name("pii-batcher".to_string())
            .spawn(move || {
                // RAII guard so the alive flag flips false (and emits a
                // FATAL log) on any UNEXPECTED exit — panic in
                // `session.run`, runtime drop, etc. The guard's Drop runs
                // even on unwind, which keeps `is_healthy()` honest.
                //
                // Graceful channel-close (every Engine handle dropped) is
                // distinguished by `batcher_loop` returning `Ok(())`; the
                // RPC-handling code disarms the guard before returning, so
                // we don't spuriously alert when the process is shutting
                // down or an integration test is tearing the engine down.
                struct AliveGuard {
                    flag: Arc<AtomicBool>,
                    armed: bool,
                }
                impl AliveGuard {
                    fn disarm(&mut self) {
                        self.armed = false;
                    }
                }
                impl Drop for AliveGuard {
                    fn drop(&mut self) {
                        if self.armed {
                            self.flag.store(false, Ordering::SeqCst);
                            tracing::error!(
                                "pii-redactor batcher thread exited unexpectedly; \
                                 redactor is now unhealthy and the pod must be restarted"
                            );
                        }
                    }
                }
                let mut guard = AliveGuard {
                    flag: batcher_alive_for_thread,
                    armed: true,
                };

                let result = batcher_runtime.block_on(batcher_loop(
                    session,
                    needs_token_type_ids,
                    max_batch_size,
                    max_queue_delay,
                    job_rx,
                ));
                if result.is_ok() {
                    // Channel closed cleanly — every `job_tx` was dropped,
                    // which only happens when the Engine is being torn
                    // down. Disarm so Drop is a no-op.
                    guard.disarm();
                }
            })
            .map_err(|e| anyhow!("spawn batcher thread: {e:#}"))?;

        Ok(Arc::new(Self {
            tokenizer,
            labels,
            cfg,
            effective_chunk_size,
            job_tx,
            batcher_alive,
        }))
    }

    /// Whether the batcher thread is still running. Flips to `false`
    /// permanently if the thread exits for any reason (channel close,
    /// panic in `session.run`, runtime error). Wire this into the gRPC
    /// readiness probe — once unhealthy, the pod must be restarted; we
    /// don't try to respawn the thread because the in-flight ORT session
    /// state is unrecoverable.
    pub fn is_healthy(&self) -> bool {
        self.batcher_alive.load(Ordering::SeqCst)
    }

    /// Tokenise `text` once (no chunking) to check size up-front. Returns
    /// the token count. Used by callers to enforce per-text caps before
    /// committing to a full inference.
    pub fn count_tokens(&self, text: &str) -> Result<usize> {
        let enc = self
            .tokenizer
            .encode(text, false)
            .map_err(|e| anyhow!("tokenize for cap check: {e}"))?;
        Ok(enc.get_ids().len())
    }

    /// Detect PII spans in each text. All windows of all texts ride the
    /// same dynamic-batching queue. Per-text serial work (tokenisation,
    /// post-process) is parallelised across texts via tokio tasks; the
    /// inference itself is serialised through one session for batch
    /// efficiency.
    pub async fn detect_spans_batch(
        self: Arc<Self>,
        texts: Vec<String>,
    ) -> Result<Vec<Vec<Span>>> {
        if texts.is_empty() {
            return Ok(Vec::new());
        }

        let n = texts.len();
        let mut tasks = Vec::with_capacity(n);
        for (i, text) in texts.into_iter().enumerate() {
            let this = self.clone();
            tasks.push(tokio::task::spawn(async move {
                let r = this.detect_spans_for_text(&text).await;
                (i, r)
            }));
        }

        let mut out: Vec<Vec<Span>> = vec![Vec::new(); n];
        for t in tasks {
            let (i, spans) = t.await.map_err(|e| anyhow!("join spans task: {e}"))?;
            out[i] = spans?;
        }
        Ok(out)
    }

    /// Tokenise + split-into-windows on the blocking pool, then submit every
    /// window to the batcher. Awaits per-window oneshots and merges spans.
    async fn detect_spans_for_text(self: Arc<Self>, text: &str) -> Result<Vec<Span>> {
        if text.is_empty() {
            return Ok(Vec::new());
        }
        // Tokenise on the blocking pool — `tokenizers` is fast, but on a
        // 24k-token text it's still a few ms of CPU we don't want stealing
        // a Tokio worker.
        let text_owned = text.to_string();
        let this = self.clone();
        let windows = tokio::task::spawn_blocking(move || this.split_into_windows(&text_owned))
            .await
            .map_err(|e| anyhow!("join tokenize task: {e}"))??;

        if windows.is_empty() {
            return Ok(Vec::new());
        }

        // Submit every window to the batcher; collect oneshots in order.
        let mut receivers = Vec::with_capacity(windows.len());
        for win in &windows {
            let (tx, rx) = oneshot::channel();
            let job = Job {
                ids: win.encoding.get_ids().to_vec(),
                mask: win.encoding.get_attention_mask().to_vec(),
                types: win.encoding.get_type_ids().to_vec(),
                reply: tx,
            };
            self.job_tx
                .send(job)
                .await
                .map_err(|_| anyhow!("batcher channel closed"))?;
            receivers.push(rx);
        }

        // Decode each window's labels back to char-offset spans, shift by
        // its `text_byte_offset`, then merge across windows.
        let mut all_spans: Vec<Span> = Vec::new();
        for (rx, win) in receivers.into_iter().zip(windows.into_iter()) {
            let token_labels = rx
                .await
                .map_err(|_| anyhow!("batcher dropped reply"))??;
            let label_spans = bioes_spans(&token_labels, &self.labels);
            let char_spans = map_to_char_spans(&win.encoding, &label_spans);
            for s in char_spans {
                all_spans.push(Span {
                    start: s.start + win.text_byte_offset,
                    end: s.end + win.text_byte_offset,
                    label: s.label,
                });
            }
        }
        Ok(merge_spans(all_spans))
    }

    /// Pure CPU work: encode `text`, decide whether to split into windows,
    /// emit one or more `TokenizedWindow`s with their byte-offset shift.
    fn split_into_windows(&self, text: &str) -> Result<Vec<TokenizedWindow>> {
        let full_enc = self
            .tokenizer
            .encode(text, false)
            .map_err(|e| anyhow!("tokenize full text: {e}"))?;
        let total_tokens = full_enc.get_ids().len();
        if total_tokens == 0 {
            return Ok(Vec::new());
        }

        if total_tokens <= self.effective_chunk_size {
            // Single window. Re-encode with special tokens so the model
            // gets its expected BOS/EOS pad.
            let enc = self
                .tokenizer
                .encode(text, true)
                .map_err(|e| anyhow!("tokenize single window: {e}"))?;
            return Ok(vec![TokenizedWindow {
                encoding: enc,
                text_byte_offset: 0,
            }]);
        }

        // Sliding window over the full-text token stream. We slice the
        // ORIGINAL text by char offsets and re-encode each window, which
        // (a) lets the tokenizer add its own special tokens automatically
        // and (b) keeps the offsets table aligned with what the model
        // actually saw for that window.
        let stride = self.effective_chunk_size - self.cfg.chunk_overlap;
        let offsets = full_enc.get_offsets();
        let mut out = Vec::new();
        let mut tok_start = 0;
        while tok_start < total_tokens {
            let tok_end = (tok_start + self.effective_chunk_size).min(total_tokens);
            let (char_start, _) = offsets[tok_start];
            let (_, char_end) = offsets[tok_end - 1];
            let safe_start = clamp_char_boundary(text, char_start, false);
            let safe_end = clamp_char_boundary(text, char_end, true);
            if safe_start >= safe_end {
                if tok_end == total_tokens {
                    break;
                }
                tok_start += stride;
                continue;
            }
            let window_text = &text[safe_start..safe_end];
            let window_enc = self
                .tokenizer
                .encode(window_text, true)
                .map_err(|e| anyhow!("tokenize window [{safe_start}..{safe_end}]: {e}"))?;
            out.push(TokenizedWindow {
                encoding: window_enc,
                text_byte_offset: safe_start,
            });
            if tok_end == total_tokens {
                break;
            }
            tok_start += stride;
        }
        Ok(out)
    }
}

/// Dedicated thread's main loop. Consumes [`Job`]s, coalesces them into
/// `(B, L)` batches, runs one forward pass per batch, fans out per-row
/// argmax labels back via oneshots.
///
/// Returns `Ok(())` when the channel closes with an empty queue (clean
/// shutdown — every `job_tx` was dropped, i.e. the Engine is being torn
/// down). Any panic inside `session.run` is caught and logged; this loop
/// only returns normally on graceful shutdown, so the caller treats the
/// `Ok(())` return as the disarm signal for its alive-guard.
async fn batcher_loop(
    mut session: Session,
    needs_token_type_ids: bool,
    max_batch_size: usize,
    max_queue_delay: Duration,
    mut rx: mpsc::Receiver<Job>,
) -> Result<()> {
    let mut queue: VecDeque<(Job, Instant)> = VecDeque::with_capacity(max_batch_size);

    loop {
        // Block for at least one job. If the channel closes and the
        // queue is empty, exit cleanly.
        if queue.is_empty() {
            match rx.recv().await {
                Some(job) => queue.push_back((job, Instant::now())),
                None => return Ok(()),
            }
        }

        // Try to fill the batch up to `max_batch_size` without blocking
        // longer than the remaining `max_queue_delay` budget for the
        // oldest queued job.
        while queue.len() < max_batch_size {
            let oldest = queue.front().map(|(_, t)| *t).unwrap_or_else(Instant::now);
            let elapsed = oldest.elapsed();
            if elapsed >= max_queue_delay {
                break;
            }
            let remaining = max_queue_delay - elapsed;
            match tokio::time::timeout(remaining, rx.recv()).await {
                Ok(Some(job)) => queue.push_back((job, Instant::now())),
                Ok(None) => break, // channel closed; drain what we have
                Err(_) => break,    // delay elapsed
            }
        }

        // Drain up to max_batch_size into a flush vec.
        let take = queue.len().min(max_batch_size);
        let mut batch: Vec<Job> = (0..take).map(|_| queue.pop_front().unwrap().0).collect();

        // Sort by descending length so padding waste is concentrated in
        // shorter rows (which contribute fewer model FLOPs anyway). Every
        // Job carries its own oneshot, so internal batch reordering is
        // invisible to callers — the caller-visible order is the order
        // each text's windows were submitted, not the batcher's flush
        // order.
        batch.sort_by(|a, b| b.ids.len().cmp(&a.ids.len()));

        // `catch_unwind` so a panic inside `session.run` (an ORT internal
        // error, ndarray shape mismatch, etc.) fails the in-flight batch
        // cleanly instead of unwinding the batcher thread. Without this,
        // one pathological input would take down the redactor for the
        // pod's lifetime — every subsequent RPC would see "batcher
        // channel closed" because the thread exited.
        match std::panic::catch_unwind(AssertUnwindSafe(|| {
            run_batch(&mut session, needs_token_type_ids, batch)
        })) {
            Ok(()) => {}
            Err(panic_payload) => {
                let msg = panic_message(&panic_payload);
                // Note: `batch` was moved into the closure, so any Jobs
                // whose oneshots weren't sent before the panic will drop
                // here — the caller's `rx.await` then resolves with
                // `Err(oneshot::error::RecvError)`, surfacing as
                // "batcher dropped reply" upstream. Acceptable: panic is
                // exceptional, callers retry.
                tracing::error!(error = %msg, "pii-redactor batch panicked; continuing");
            }
        }
    }
}

/// Best-effort extraction of a panic payload's `&str` / `String` body.
fn panic_message(payload: &Box<dyn std::any::Any + Send>) -> String {
    if let Some(s) = payload.downcast_ref::<&'static str>() {
        return (*s).to_string();
    }
    if let Some(s) = payload.downcast_ref::<String>() {
        return s.clone();
    }
    "non-string panic payload".to_string()
}

/// Pad [`Job`]s to the longest sequence length in the batch, build `(B, L)`
/// tensors, run one inference, fan out per-row labels.
fn run_batch(session: &mut Session, needs_token_type_ids: bool, jobs: Vec<Job>) {
    if jobs.is_empty() {
        return;
    }
    let batch_size = jobs.len();
    let max_len = jobs.iter().map(|j| j.ids.len()).max().unwrap_or(0);
    if max_len == 0 {
        for j in jobs {
            let _ = j.reply.send(Ok(Vec::new()));
        }
        return;
    }
    // Visibility into batcher efficiency. `padding_ratio` near 1.0 means
    // every row is the same length (perfect bucketing); near 0.0 means we
    // wasted most of the (B, L) tensor on pad tokens. Sort-by-length keeps
    // it high in practice.
    let total_real_tokens: usize = jobs.iter().map(|j| j.ids.len()).sum();
    let padded_tokens = batch_size * max_len;
    let padding_ratio = if padded_tokens > 0 {
        total_real_tokens as f64 / padded_tokens as f64
    } else {
        1.0
    };
    let started = Instant::now();

    let mut input_ids = Array2::<i64>::zeros((batch_size, max_len));
    let mut attention_mask = Array2::<i64>::zeros((batch_size, max_len));
    let mut token_type_ids = Array2::<i64>::zeros((batch_size, max_len));
    for (b, job) in jobs.iter().enumerate() {
        for (j, &id) in job.ids.iter().enumerate() {
            input_ids[(b, j)] = id as i64;
        }
        for (j, &m) in job.mask.iter().enumerate() {
            attention_mask[(b, j)] = m as i64;
        }
        for (j, &t) in job.types.iter().enumerate() {
            token_type_ids[(b, j)] = t as i64;
        }
    }

    let outputs = (|| -> Result<Vec<Vec<u32>>> {
        let input_ids_t = TensorRef::from_array_view(&input_ids)?;
        let mask_t = TensorRef::from_array_view(&attention_mask)?;
        let token_type_t = TensorRef::from_array_view(&token_type_ids)?;
        let mut inputs: Vec<(&str, SessionInputValue<'_>)> = vec![
            ("input_ids", input_ids_t.into()),
            ("attention_mask", mask_t.into()),
        ];
        if needs_token_type_ids {
            inputs.push(("token_type_ids", token_type_t.into()));
        }
        let outputs = session.run(inputs)?;
        let logits_value = &outputs[0];
        let (shape, data) = logits_value.try_extract_tensor::<f32>()?;
        let dims: Vec<usize> = shape.iter().map(|d| *d as usize).collect();
        if dims.len() != 3 {
            return Err(anyhow!(
                "expected logits shape [batch, seq, num_labels], got {dims:?}"
            ));
        }
        if dims[0] != batch_size {
            return Err(anyhow!(
                "logits batch dim {} != input batch {}",
                dims[0],
                batch_size
            ));
        }
        let logits = ArrayView::from_shape((dims[0], dims[1], dims[2]), data)?;

        let mut out = Vec::with_capacity(batch_size);
        for b in 0..batch_size {
            let row = logits.index_axis(Axis(0), b);
            // Slice each row to its actual (un-padded) length so callers
            // don't have to think about pad tokens at the BIOES layer.
            let actual_len = jobs[b].ids.len();
            let truncated = row.slice(ndarray::s![..actual_len, ..]);
            out.push(argmax_per_token(truncated));
        }
        Ok(out)
    })();

    let elapsed_ms = started.elapsed().as_millis();
    match outputs {
        Ok(per_row) => {
            tracing::debug!(
                batch_size,
                max_len,
                total_real_tokens,
                padding_ratio = format!("{:.3}", padding_ratio),
                elapsed_ms = elapsed_ms as u64,
                "pii_redactor batch flushed"
            );
            for (job, labels) in jobs.into_iter().zip(per_row.into_iter()) {
                let _ = job.reply.send(Ok(labels));
            }
        }
        Err(e) => {
            tracing::warn!(
                batch_size,
                max_len,
                elapsed_ms = elapsed_ms as u64,
                error = %e,
                "pii_redactor batch failed"
            );
            let msg = format!("{e:#}");
            for job in jobs {
                let _ = job.reply.send(Err(anyhow!("{msg}")));
            }
        }
    }
}

/// Clamp `pos` to the nearest UTF-8 char boundary in `text`. If `pos` already
/// is a boundary, returns it unchanged. `expand_right=true` rounds up to the
/// next boundary; otherwise rounds down.
fn clamp_char_boundary(text: &str, pos: usize, expand_right: bool) -> usize {
    if pos > text.len() {
        return text.len();
    }
    if text.is_char_boundary(pos) {
        return pos;
    }
    if expand_right {
        let mut p = pos;
        while p < text.len() && !text.is_char_boundary(p) {
            p += 1;
        }
        p
    } else {
        let mut p = pos;
        while p > 0 && !text.is_char_boundary(p) {
            p -= 1;
        }
        p
    }
}

fn argmax_per_token(row: ArrayView<f32, ndarray::Ix2>) -> Vec<u32> {
    row.outer_iter()
        .map(|tok| {
            let mut best = 0usize;
            let mut best_v = f32::NEG_INFINITY;
            for (i, v) in tok.iter().enumerate() {
                if *v > best_v {
                    best_v = *v;
                    best = i;
                }
            }
            best as u32
        })
        .collect()
}

#[derive(Debug, Clone)]
struct LabelSpan {
    start_token: usize,
    end_token: usize,
    label: String,
}

fn bioes_spans(token_labels: &[u32], labels: &LabelMap) -> Vec<LabelSpan> {
    let mut out = Vec::new();
    let mut current: Option<LabelSpan> = None;
    for (i, id) in token_labels.iter().enumerate() {
        let raw = labels.lookup(*id);
        let (prefix, base) = split_bioes(raw);
        match prefix {
            "O" => {
                if let Some(s) = current.take() {
                    out.push(s);
                }
            }
            "B" => {
                if let Some(s) = current.take() {
                    out.push(s);
                }
                current = Some(LabelSpan {
                    start_token: i,
                    end_token: i + 1,
                    label: base.to_string(),
                });
            }
            "S" => {
                if let Some(s) = current.take() {
                    out.push(s);
                }
                out.push(LabelSpan {
                    start_token: i,
                    end_token: i + 1,
                    label: base.to_string(),
                });
            }
            "E" => match current.take() {
                Some(mut s) if s.label == base => {
                    s.end_token = i + 1;
                    out.push(s);
                }
                Some(s) => {
                    out.push(s);
                    out.push(LabelSpan {
                        start_token: i,
                        end_token: i + 1,
                        label: base.to_string(),
                    });
                }
                None => out.push(LabelSpan {
                    start_token: i,
                    end_token: i + 1,
                    label: base.to_string(),
                }),
            },
            _ => match current.as_mut() {
                Some(s) if s.label == base => s.end_token = i + 1,
                _ => {
                    if let Some(s) = current.take() {
                        out.push(s);
                    }
                    current = Some(LabelSpan {
                        start_token: i,
                        end_token: i + 1,
                        label: base.to_string(),
                    });
                }
            },
        }
    }
    if let Some(s) = current {
        out.push(s);
    }
    out
}

fn split_bioes(label: &str) -> (&str, &str) {
    if label == "O" {
        return ("O", "");
    }
    if let Some(rest) = label.strip_prefix("B-") {
        return ("B", rest);
    }
    if let Some(rest) = label.strip_prefix("I-") {
        return ("I", rest);
    }
    if let Some(rest) = label.strip_prefix("E-") {
        return ("E", rest);
    }
    if let Some(rest) = label.strip_prefix("S-") {
        return ("S", rest);
    }
    ("X", label)
}

/// Convert token-level BIOES spans into byte-offset char spans relative to
/// the ORIGINAL text that produced `encoding`. Special tokens (CLS/SEP/PAD)
/// contribute no chars and are dropped.
fn map_to_char_spans(encoding: &Encoding, spans: &[LabelSpan]) -> Vec<Span> {
    let offsets = encoding.get_offsets();
    let special = encoding.get_special_tokens_mask();
    let mut out = Vec::with_capacity(spans.len());
    for s in spans {
        let mut start: Option<usize> = None;
        let mut end: Option<usize> = None;
        for t in s.start_token..s.end_token.min(offsets.len()) {
            if special.get(t).copied().unwrap_or(0) == 1 {
                continue;
            }
            let (a, b) = offsets[t];
            if a == 0 && b == 0 {
                continue;
            }
            if start.is_none() {
                start = Some(a);
            }
            end = Some(b);
        }
        if let (Some(a), Some(b)) = (start, end) {
            if b > a {
                out.push(Span {
                    start: a,
                    end: b,
                    label: s.label.clone(),
                });
            }
        }
    }
    merge_spans(out)
}

/// Sort + merge same-label adjacent/overlapping spans. Different-label
/// overlaps are kept independent (callers can decide what to do).
pub fn merge_spans(mut spans: Vec<Span>) -> Vec<Span> {
    if spans.len() <= 1 {
        return spans;
    }
    spans.sort_by_key(|s| (s.start, s.end));
    let mut out: Vec<Span> = Vec::with_capacity(spans.len());
    for s in spans {
        match out.last_mut() {
            Some(prev) if prev.end >= s.start && prev.label == s.label => {
                if s.end > prev.end {
                    prev.end = s.end;
                }
            }
            _ => out.push(s),
        }
    }
    out
}
