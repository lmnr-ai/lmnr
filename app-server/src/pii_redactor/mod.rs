use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use anyhow::{Result, anyhow};
use tonic::transport::Channel;
use tracing::Instrument;
use uuid::Uuid;

use crate::cache::Cache;
use crate::ch::shared_content::CHSharedContent;
use crate::db::DB;
use crate::db::spans::Span;
use crate::utils::limits::get_workspace_info_for_project_id;
use crate::utils::sanitize_string;

#[allow(clippy::all)]
pub mod pii_redactor;

use pii_redactor::{
    RedactRequest, pii_redactor_service_client::PiiRedactorServiceClient,
};

#[derive(Clone)]
pub struct PiiRedactorClient {
    client: Arc<PiiRedactorServiceClient<Channel>>,
}

impl PiiRedactorClient {
    pub fn new(client: PiiRedactorServiceClient<Channel>) -> Self {
        Self {
            client: Arc::new(client),
        }
    }

    /// Send a list of stringified-JSON texts and get back the redacted ones,
    /// preserving order. Empty input short-circuits without an RPC.
    async fn redact(&self, texts: Vec<String>) -> Result<Vec<String>> {
        if texts.is_empty() {
            return Ok(Vec::new());
        }
        let mut client = self.client.as_ref().clone();
        let req = RedactRequest {
            texts,
            placeholder_format: None,
            skip_keys: Vec::new(),
        };
        let resp = client
            .redact(tonic::Request::new(req))
            .await
            .map_err(|e| anyhow!("pii-redactor rpc: {}", e.message()))?
            .into_inner();
        Ok(resp.texts)
    }
}

/// What field a redacted text should be written back to.
enum Target {
    /// Whole `span.input`. For root LLM spans this carries the
    /// `root_span_input` preview surfaced in the trace list; for non-LLM
    /// spans it's the only input we have. Either way the producer kept
    /// `span.input` populated for these — see `preprocess_for_queue`.
    Input(usize),
    /// Whole `span.output`.
    Output(usize),
    /// One newly-deduped LLM input or output message — written back into the
    /// `shared_content[k].content` row that's about to be inserted into the
    /// `shared_content` CH table. Quickwit indexing reads from the same row,
    /// so a single update covers both storage tiers.
    DedupMessage(usize),
}

/// Resolve `settings.remove_pii` for every unique project in `recordable_indices`,
/// going through the cached billing-info path so repeat batches are free.
/// Returns the set of opted-in project ids — empty set means "no work".
async fn resolve_opted_in_projects(
    spans: &[Span],
    recordable_indices: &[usize],
    db: Arc<DB>,
    cache: Arc<Cache>,
) -> HashSet<Uuid> {
    let unique: HashSet<Uuid> = recordable_indices
        .iter()
        .map(|&i| spans[i].project_id)
        .collect();
    let mut opted_in: HashSet<Uuid> = HashSet::with_capacity(unique.len());
    for project_id in unique {
        match get_workspace_info_for_project_id(db.clone(), cache.clone(), project_id).await {
            Ok(Some(info)) if info.settings.remove_pii => {
                opted_in.insert(project_id);
            }
            Ok(_) => {}
            Err(e) => {
                log::warn!("pii-redactor: lookup project[{project_id}] settings: {e:#}");
            }
        }
    }
    opted_in
}

/// Per-direction (input or output) view of the dedup batch the redactor
/// needs to walk: which positions in the unified `shared_content` buffer
/// belong to span `dedup_idx`, plus a parallel `span_content_bytes` slot
/// that gets fixed up when redaction changes the byte length. Indexed by
/// `dedup_idx` (matching `recordable_indices`).
pub struct DedupRedactionView<'a> {
    pub span_new_message_indices: &'a [Vec<usize>],
    pub span_content_bytes: &'a mut [usize],
}

/// Redact `span.input` / `span.output` for every span whose project has
/// `remove_pii=true`. For dedup'd LLM spans the new-message slice of the
/// shared `shared_content` buffer is redacted in place — Quickwit and the
/// `shared_content` CH table share that buffer, so one update covers both.
/// Already-seen messages are not in the buffer and are not redacted (they
/// were redacted on first emit). Tool-definition blobs share the same
/// buffer too but are NOT walked here (tool definitions are schemas, not
/// user text). All redaction happens in a single batched RPC.
///
/// MUST run after `build_dedup_batch` (input + output) and BEFORE the
/// `shared_content` ClickHouse insert.
///
/// Best-effort: any RPC failure is logged and the batch is left untouched —
/// PII redaction must never block trace ingestion.
pub async fn redact_spans_in_place(
    client: &PiiRedactorClient,
    spans: &mut [Span],
    shared_content: &mut Vec<CHSharedContent>,
    input_view: DedupRedactionView<'_>,
    output_view: DedupRedactionView<'_>,
    recordable_indices: &[usize],
    db: Arc<DB>,
    cache: Arc<Cache>,
) {
    let opted_in = resolve_opted_in_projects(spans, recordable_indices, db, cache).await;
    if opted_in.is_empty() {
        return;
    }

    // Map project_id → whether it's opted in, then map span_idx → opted-in
    // bool once so the inner loops don't re-borrow.
    let opt_in_for_span: HashMap<usize, bool> = recordable_indices
        .iter()
        .map(|&i| (i, opted_in.contains(&spans[i].project_id)))
        .collect();

    let mut targets: Vec<Target> = Vec::new();
    let mut texts: Vec<String> = Vec::new();
    // `input_view`/`output_view`'s `span_content_bytes[dedup_idx]` was
    // computed from pre-redaction `content.len()` in `build_dedup_batch`.
    // Redaction mutates `content` in place, so any opted-in span's entry
    // must be corrected before the post-dedup input-bytes loop reads it.
    // Track per-message which (direction, dedup_idx) it belongs to so we
    // can apply the delta on write-back.
    enum Dir {
        Input,
        Output,
    }
    let mut msg_to_dedup: HashMap<usize, (Dir, usize)> = HashMap::new();

    for (dedup_idx, &span_idx) in recordable_indices.iter().enumerate() {
        if !*opt_in_for_span.get(&span_idx).unwrap_or(&false) {
            continue;
        }
        let span = &spans[span_idx];

        // Dedup'd LLM input: redact each new input message via the shared
        // buffer, which is the same buffer Quickwit indexing reads.
        if let Some(idxs) = input_view.span_new_message_indices.get(dedup_idx) {
            for &msg_idx in idxs {
                let Some(msg) = shared_content.get(msg_idx) else {
                    continue;
                };
                msg_to_dedup.insert(msg_idx, (Dir::Input, dedup_idx));
                targets.push(Target::DedupMessage(msg_idx));
                texts.push(msg.content.clone());
            }
        }

        // Dedup'd LLM output: same shape as input.
        if let Some(idxs) = output_view.span_new_message_indices.get(dedup_idx) {
            for &msg_idx in idxs {
                let Some(msg) = shared_content.get(msg_idx) else {
                    continue;
                };
                msg_to_dedup.insert(msg_idx, (Dir::Output, dedup_idx));
                targets.push(Target::DedupMessage(msg_idx));
                texts.push(msg.content.clone());
            }
        }

        // Whole `span.input`. Producer-side dedup strips this to `None` for
        // nested LLM spans (those ride the wire as hashes only), so this
        // covers (a) root LLM spans whose `input` was kept for the trace
        // list preview and (b) non-LLM / non-array-input spans.
        if let Some(input) = span.input.as_ref() {
            match serde_json::to_string(input) {
                Ok(s) => {
                    targets.push(Target::Input(span_idx));
                    texts.push(s);
                }
                Err(e) => log::warn!(
                    "pii-redactor: serialize span[{span_idx}].input: {e:#}"
                ),
            }
        }

        if let Some(output) = span.output.as_ref() {
            match serde_json::to_string(output) {
                Ok(s) => {
                    targets.push(Target::Output(span_idx));
                    texts.push(s);
                }
                Err(e) => log::warn!(
                    "pii-redactor: serialize span[{span_idx}].output: {e:#}"
                ),
            }
        }
    }

    if texts.is_empty() {
        return;
    }

    // Summary stats over per-element char counts, so the trace shows the
    // shape of the request without growing unboundedly with batch size
    // (OTEL collectors commonly truncate attributes above 128–256 bytes,
    // so a full `Vec<usize>` for a 1024-element batch would be silently
    // cut off). `total_chars` + `min/max/p50` is enough to distinguish
    // "one giant 200k text" from "fifty 4k texts" at the same batch_size.
    let mut char_counts: Vec<usize> = texts.iter().map(|t| t.chars().count()).collect();
    let total_chars: usize = char_counts.iter().sum();
    char_counts.sort_unstable();
    let min_chars = char_counts.first().copied().unwrap_or(0);
    let max_chars = char_counts.last().copied().unwrap_or(0);
    let p50_chars = char_counts.get(char_counts.len() / 2).copied().unwrap_or(0);
    let rpc_span = tracing::info_span!(
        "pii_redactor.rpc",
        batch_size = texts.len(),
        total_chars,
        min_chars,
        max_chars,
        p50_chars,
    );
    let redacted = match client.redact(texts).instrument(rpc_span).await {
        Ok(r) => r,
        Err(e) => {
            log::error!("pii-redactor: skipping batch of {} fields: {e:#}", targets.len());
            return;
        }
    };
    if redacted.len() != targets.len() {
        log::error!(
            "pii-redactor: response len {} != request len {}; skipping",
            redacted.len(),
            targets.len()
        );
        return;
    }

    let DedupRedactionView {
        span_new_message_indices: _,
        span_content_bytes: input_bytes,
    } = input_view;
    let DedupRedactionView {
        span_new_message_indices: _,
        span_content_bytes: output_bytes,
    } = output_view;
    for (target, text) in targets.into_iter().zip(redacted.into_iter()) {
        match target {
            Target::Input(idx) => match serde_json::from_str(&text) {
                Ok(v) => spans[idx].input = Some(v),
                Err(e) => log::warn!("pii-redactor: parse redacted span[{idx}].input: {e:#}"),
            },
            Target::Output(idx) => match serde_json::from_str(&text) {
                Ok(v) => spans[idx].output = Some(v),
                Err(e) => log::warn!("pii-redactor: parse redacted span[{idx}].output: {e:#}"),
            },
            Target::DedupMessage(idx) => {
                if let Some(msg) = shared_content.get_mut(idx) {
                    // The redactor returns stringified JSON; sanitize to
                    // match the non-redact path's `sanitize_string(&item.to_string())`.
                    let new_content = sanitize_string(&text);
                    let old_len = msg.content.len();
                    let new_len = new_content.len();
                    msg.content = new_content;
                    // Refresh the byte attribution `build_dedup_batch` baked
                    // in pre-redaction so the post-dedup input-bytes loop
                    // bills the redacted size, matching the comment on
                    // `estimate_size_bytes` ("size reflects redacted content").
                    if let Some(&(ref dir, dedup_idx)) = msg_to_dedup.get(&idx) {
                        let slot = match dir {
                            Dir::Input => input_bytes.get_mut(dedup_idx),
                            Dir::Output => output_bytes.get_mut(dedup_idx),
                        };
                        if let Some(slot) = slot {
                            *slot = slot.saturating_sub(old_len).saturating_add(new_len);
                        }
                    }
                }
            }
        }
    }
}
