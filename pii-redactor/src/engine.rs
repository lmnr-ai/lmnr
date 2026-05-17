use std::path::PathBuf;
use std::sync::Arc;

use anyhow::{Context, Result, anyhow};
use ndarray::{Array2, ArrayView, Axis};
use ort::session::{Session, SessionInputValue, builder::GraphOptimizationLevel};
use ort::value::TensorRef;
use tokenizers::{Encoding, Tokenizer};
use tokio::sync::Semaphore;

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
    pub num_sessions: usize,
}

/// One detected PII span, in byte offsets of the input text.
#[derive(Debug, Clone)]
pub struct Span {
    pub start: usize,
    pub end: usize,
    pub label: String,
}

pub struct Engine {
    tokenizer: Tokenizer,
    labels: LabelMap,
    /// Pool of pre-loaded ORT sessions. Acquiring a permit from `permits`
    /// guarantees a session is available, so the permitted task pops a
    /// session under a short Mutex lock and pushes it back when done. This
    /// avoids the round-robin / permit-count divergence where a permitted
    /// task could pick a still-busy session while another sat idle.
    sessions: std::sync::Mutex<Vec<Session>>,
    permits: Arc<Semaphore>,
    needs_token_type_ids: bool,
    cfg: EngineConfig,
    /// `chunk_size` minus the tokens the tokenizer adds when called with
    /// `add_special_tokens=true` (e.g. CLS/SEP for BERT-family models).
    /// Inference always re-encodes with special tokens, so the chunk
    /// decision must reserve room for them — feeding the model
    /// `chunk_size` content tokens would produce `chunk_size + overhead`
    /// inputs and overflow positional embeddings on models whose
    /// `max_position_embeddings` matches `chunk_size`.
    effective_chunk_size: usize,
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

        let _ = ort::init().commit();

        let mut sessions = Vec::with_capacity(cfg.num_sessions);
        let mut needs_token_type_ids: Option<bool> = None;
        for _ in 0..cfg.num_sessions {
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
            needs_token_type_ids
                .get_or_insert_with(|| session.inputs().iter().any(|i| i.name() == "token_type_ids"));
            sessions.push(session);
        }
        let needs_token_type_ids = needs_token_type_ids.unwrap_or(false);

        let permits = Arc::new(Semaphore::new(cfg.num_sessions));

        Ok(Arc::new(Self {
            tokenizer,
            labels,
            sessions: std::sync::Mutex::new(sessions),
            permits,
            needs_token_type_ids,
            cfg,
            effective_chunk_size,
        }))
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

    /// Detect PII spans in each text. Each text is independently chunked if
    /// its tokenisation exceeds `chunk_size`. Returns byte offsets within
    /// each input text. Texts are processed concurrently subject to the
    /// session permit pool.
    pub async fn detect_spans_batch(
        self: Arc<Self>,
        texts: Vec<String>,
    ) -> Result<Vec<Vec<Span>>> {
        if texts.is_empty() {
            return Ok(Vec::new());
        }

        let mut tasks = Vec::with_capacity(texts.len());
        for (i, text) in texts.into_iter().enumerate() {
            let this = self.clone();
            let permits = self.permits.clone();
            tasks.push(tokio::task::spawn(async move {
                let permit = permits
                    .acquire_owned()
                    .await
                    .map_err(|e| anyhow!("semaphore closed: {e}"))?;
                let result = tokio::task::spawn_blocking(move || {
                    let r = this.detect_spans_blocking(&text);
                    drop(permit);
                    r.map(|spans| (i, spans))
                })
                .await
                .map_err(|e| anyhow!(e))?;
                result
            }));
        }

        let n = tasks.len();
        let mut out: Vec<Vec<Span>> = vec![Vec::new(); n];
        for t in tasks {
            let (i, spans) = t.await.map_err(|e| anyhow!(e))??;
            out[i] = spans;
        }
        Ok(out)
    }

    /// Single-text detection, sync. If the text fits in one window, runs one
    /// inference; otherwise slides chunk_size/chunk_overlap windows and
    /// merges spans across them.
    fn detect_spans_blocking(&self, text: &str) -> Result<Vec<Span>> {
        if text.is_empty() {
            return Ok(Vec::new());
        }
        // Tokenise once to decide whether chunking is needed.
        let full_enc = self
            .tokenizer
            .encode(text, false)
            .map_err(|e| anyhow!("tokenize full text: {e}"))?;
        let total_tokens = full_enc.get_ids().len();

        if total_tokens == 0 {
            return Ok(Vec::new());
        }
        if total_tokens <= self.effective_chunk_size {
            // Single window: re-encode with special tokens so the model gets
            // its expected BOS/EOS pad.
            let enc = self
                .tokenizer
                .encode(text, true)
                .map_err(|e| anyhow!("tokenize single window: {e}"))?;
            return self.run_inference_one(&enc);
        }

        // Sliding window over the full-text token stream. We slice the
        // ORIGINAL text by char offsets and re-encode each window, which
        // (a) lets the tokenizer add its own special tokens automatically and
        // (b) keeps the offsets table aligned with what the model actually
        // saw for that window.
        let stride = self.effective_chunk_size - self.cfg.chunk_overlap;
        let offsets = full_enc.get_offsets();
        let mut all_spans: Vec<Span> = Vec::new();
        let mut tok_start = 0;
        while tok_start < total_tokens {
            let tok_end = (tok_start + self.effective_chunk_size).min(total_tokens);
            let (char_start, _) = offsets[tok_start];
            let (_, char_end) = offsets[tok_end - 1];
            // Defensive: ensure we slice on UTF-8 boundaries.
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
            let window_spans = self.run_inference_one(&window_enc)?;
            for s in window_spans {
                all_spans.push(Span {
                    start: s.start + safe_start,
                    end: s.end + safe_start,
                    label: s.label,
                });
            }
            if tok_end == total_tokens {
                break;
            }
            tok_start += stride;
        }

        // Merge spans that overlap across windows (or even within a window),
        // collapsing same-label adjacent/overlapping ranges into one.
        Ok(merge_spans(all_spans))
    }

    fn run_inference_one(&self, enc: &Encoding) -> Result<Vec<Span>> {
        let ids = enc.get_ids();
        let mask = enc.get_attention_mask();
        let types = enc.get_type_ids();
        let seq_len = ids.len();
        if seq_len == 0 {
            return Ok(Vec::new());
        }

        let mut input_ids = Array2::<i64>::zeros((1, seq_len));
        let mut attention_mask = Array2::<i64>::zeros((1, seq_len));
        let mut token_type_ids = Array2::<i64>::zeros((1, seq_len));
        for j in 0..seq_len {
            input_ids[(0, j)] = ids[j] as i64;
            attention_mask[(0, j)] = mask[j] as i64;
            token_type_ids[(0, j)] = types[j] as i64;
        }

        // Caller holds a session permit, so the pool always has one to lend.
        let mut session = {
            let mut pool = self
                .sessions
                .lock()
                .unwrap_or_else(|p| p.into_inner());
            pool.pop().ok_or_else(|| {
                anyhow!("session pool empty despite holding a permit (invariant violation)")
            })?
        };

        let result = (|| -> Result<Vec<Span>> {
            let input_ids_t = TensorRef::from_array_view(&input_ids)?;
            let mask_t = TensorRef::from_array_view(&attention_mask)?;
            let token_type_t = TensorRef::from_array_view(&token_type_ids)?;
            let mut inputs: Vec<(&str, SessionInputValue<'_>)> = vec![
                ("input_ids", input_ids_t.into()),
                ("attention_mask", mask_t.into()),
            ];
            if self.needs_token_type_ids {
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
            let logits = ArrayView::from_shape((dims[0], dims[1], dims[2]), data)?;
            let row = logits.index_axis(Axis(0), 0);
            let token_labels = argmax_per_token(row);
            let label_spans = bioes_spans(&token_labels, &self.labels);
            Ok(map_to_char_spans(enc, &label_spans))
        })();

        // Always return the session so a single inference error doesn't shrink
        // the pool (the permit count would then over-promise availability).
        self.sessions
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .push(session);

        result
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
