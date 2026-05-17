use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};

use anyhow::{Context, Result, anyhow};
use ndarray::{Array2, ArrayView, Axis};
use ort::session::{Session, SessionInputValue, builder::GraphOptimizationLevel};
use ort::value::TensorRef;
use tokenizers::Tokenizer;
use tokio::sync::Semaphore;

use crate::labels::LabelMap;

#[derive(Debug, Clone)]
pub struct EngineConfig {
    pub model_dir: PathBuf,
    pub max_seq_len: usize,
    pub max_batch_size: usize,
    pub intra_threads: usize,
    pub inter_threads: usize,
    pub num_sessions: usize,
}

pub struct Engine {
    tokenizer: Tokenizer,
    labels: LabelMap,
    sessions: Vec<std::sync::Mutex<Session>>,
    permits: Arc<Semaphore>,
    needs_token_type_ids: bool,
    cfg: EngineConfig,
    next_session: AtomicUsize,
}

impl Engine {
    pub fn load(cfg: EngineConfig) -> Result<Arc<Self>> {
        let tokenizer_path = cfg.model_dir.join("tokenizer.json");
        let model_path = cfg.model_dir.join("model.onnx");
        let config_path = cfg.model_dir.join("config.json");

        let tokenizer = Tokenizer::from_file(&tokenizer_path)
            .map_err(|e| anyhow!("loading tokenizer.json: {e}"))?;
        let labels = LabelMap::from_config_json(&config_path)?;

        // Best-effort init — sessions can still load against an existing env.
        let _ = ort::init().commit();

        let mut sessions = Vec::with_capacity(cfg.num_sessions);
        let mut needs_token_type_ids = false;
        for _ in 0..cfg.num_sessions {
            // ort's builder errors wrap the (non-Send) builder, so they don't
            // implement Send/Sync — convert with map_err and `{e:#}` rather
            // than `?` to keep the `Engine::load` future Send-able.
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
            needs_token_type_ids = session.inputs.iter().any(|i| i.name == "token_type_ids");
            sessions.push(std::sync::Mutex::new(session));
        }

        let permits = Arc::new(Semaphore::new(cfg.num_sessions));

        Ok(Arc::new(Self {
            tokenizer,
            labels,
            sessions,
            permits,
            needs_token_type_ids,
            cfg,
            next_session: AtomicUsize::new(0),
        }))
    }

    pub async fn redact(
        self: Arc<Self>,
        texts: Vec<String>,
        placeholder_fmt: String,
    ) -> Result<Vec<String>> {
        if texts.is_empty() {
            return Ok(Vec::new());
        }

        let chunks: Vec<(usize, Vec<String>)> = texts
            .chunks(self.cfg.max_batch_size)
            .enumerate()
            .map(|(idx, c)| (idx * self.cfg.max_batch_size, c.to_vec()))
            .collect();

        let mut out: Vec<String> = vec![String::new(); texts.len()];
        let mut tasks = Vec::with_capacity(chunks.len());
        for (offset, chunk) in chunks {
            let this = self.clone();
            let fmt = placeholder_fmt.clone();
            let permits = self.permits.clone();
            tasks.push(tokio::task::spawn(async move {
                let permit = permits
                    .acquire_owned()
                    .await
                    .map_err(|e| anyhow!("semaphore closed: {e}"))?;
                let result = tokio::task::spawn_blocking(move || {
                    let r = this.redact_chunk_blocking(&chunk, &fmt);
                    drop(permit);
                    r.map(|res| (offset, res))
                })
                .await
                .map_err(|e| anyhow!(e))?;
                result
            }));
        }

        for t in tasks {
            let (offset, redacted) = t.await.map_err(|e| anyhow!(e))??;
            for (i, text) in redacted.into_iter().enumerate() {
                out[offset + i] = text;
            }
        }
        Ok(out)
    }

    fn redact_chunk_blocking(
        &self,
        texts: &[String],
        placeholder_fmt: &str,
    ) -> Result<Vec<String>> {
        let encodings = self
            .tokenizer
            .encode_batch(texts.to_vec(), true)
            .map_err(|e| anyhow!("tokenize: {e}"))?;

        let max_len = encodings
            .iter()
            .map(|e| e.get_ids().len().min(self.cfg.max_seq_len))
            .max()
            .unwrap_or(0);
        if max_len == 0 {
            return Ok(texts.to_vec());
        }
        let batch = encodings.len();

        let mut input_ids = Array2::<i64>::zeros((batch, max_len));
        let mut attention_mask = Array2::<i64>::zeros((batch, max_len));
        let mut token_type_ids = Array2::<i64>::zeros((batch, max_len));

        for (i, enc) in encodings.iter().enumerate() {
            let ids = enc.get_ids();
            let mask = enc.get_attention_mask();
            let types = enc.get_type_ids();
            let len = ids.len().min(max_len);
            for j in 0..len {
                input_ids[(i, j)] = ids[j] as i64;
                attention_mask[(i, j)] = mask[j] as i64;
                token_type_ids[(i, j)] = types[j] as i64;
            }
        }

        let session_idx = self.next_session.fetch_add(1, Ordering::Relaxed) % self.sessions.len();
        // Recover from a prior panic-poisoned mutex — ORT sessions are
        // re-usable, and we'd rather serve the next request than turn one
        // panic into a permanent outage of this slot.
        let mut session = self.sessions[session_idx]
            .lock()
            .unwrap_or_else(|p| p.into_inner());

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

        let mut out = Vec::with_capacity(batch);
        for (i, text) in texts.iter().enumerate() {
            let enc = &encodings[i];
            let row = logits.index_axis(Axis(0), i);
            let token_labels = argmax_per_token(row);
            let spans = bioes_spans(&token_labels, &self.labels);
            let char_spans = map_to_char_spans(text, enc, &spans, self.cfg.max_seq_len);
            out.push(redact_text(text, &char_spans, placeholder_fmt));
        }
        Ok(out)
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

// Handles both BIO and BIOES schemes. BIO emitters never produce E-/S- so the
// E-/S- arms simply don't fire for them; BIOES emitters (e.g. the OpenAI
// privacy filter) get correct single-token and end-of-span handling.
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
            // "I-" continuation: extend if same base, else start a new span.
            // "X" (un-prefixed labels): treat the same as I-.
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

fn map_to_char_spans(
    text: &str,
    encoding: &tokenizers::Encoding,
    spans: &[LabelSpan],
    max_seq_len: usize,
) -> Vec<(usize, usize, String)> {
    let offsets = encoding.get_offsets();
    let special = encoding.get_special_tokens_mask();
    let mut out = Vec::with_capacity(spans.len());
    for s in spans {
        let mut start = None;
        let mut end = None;
        for t in s.start_token..s.end_token.min(max_seq_len).min(offsets.len()) {
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
            if b > a && b <= text.len() {
                out.push((a, b, s.label.clone()));
            }
        }
    }
    out.sort_by_key(|(a, _, _)| *a);
    let mut merged: Vec<(usize, usize, String)> = Vec::with_capacity(out.len());
    for (a, b, lbl) in out {
        match merged.last_mut() {
            Some(prev) if prev.1 >= a && prev.2 == lbl => {
                if b > prev.1 {
                    prev.1 = b;
                }
            }
            _ => merged.push((a, b, lbl)),
        }
    }
    merged
}

fn redact_text(text: &str, spans: &[(usize, usize, String)], fmt: &str) -> String {
    if spans.is_empty() {
        return text.to_string();
    }
    let bytes = text.as_bytes();
    let mut out = String::with_capacity(text.len());
    let mut cursor = 0;
    for (a, b, lbl) in spans {
        if *a < cursor || *a > bytes.len() || *b > bytes.len() {
            continue;
        }
        if !text.is_char_boundary(*a) || !text.is_char_boundary(*b) {
            continue;
        }
        out.push_str(&text[cursor..*a]);
        out.push_str(&fmt.replace("{LABEL}", &lbl.to_uppercase()));
        cursor = *b;
    }
    if cursor < bytes.len() {
        out.push_str(&text[cursor..]);
    }
    out
}
