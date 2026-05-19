use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use anyhow::{Result, anyhow};
use tonic::transport::Channel;
use uuid::Uuid;

use crate::cache::Cache;
use crate::db::DB;
use crate::db::spans::Span;
use crate::traces::input_dedup::DedupBatch;
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
    /// One newly-deduped LLM input message — written back into the
    /// `dedup.messages[k].content` row that's about to be inserted into
    /// `llm_messages`. Quickwit indexing reads from the same row, so a
    /// single update covers both storage tiers.
    DedupMessage(usize),
}

/// Resolve `remove_pii` for every unique project in `recordable_indices`,
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
            Ok(Some(info)) if info.remove_pii => {
                opted_in.insert(project_id);
            }
            Ok(_) => {}
            Err(e) => {
                log::warn!("pii-redactor: lookup project[{project_id}] remove_pii: {e:#}");
            }
        }
    }
    opted_in
}

/// Redact `span.input` / `span.output` for every span whose project has
/// `remove_pii=true`. For dedup'd LLM spans the new-message slice of the
/// `dedup.messages` batch is redacted in place — Quickwit and `llm_messages`
/// share that buffer, so one update covers both. Already-seen messages are
/// not in the batch and are not redacted (they were redacted on first
/// emit). All redaction happens in a single batched RPC.
///
/// MUST run after `build_dedup_batch` and BEFORE the `llm_messages`
/// ClickHouse insert.
///
/// Best-effort: any RPC failure is logged and the batch is left untouched —
/// PII redaction must never block trace ingestion.
pub async fn redact_spans_in_place(
    client: &PiiRedactorClient,
    spans: &mut [Span],
    dedup: &mut DedupBatch,
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
    // `dedup.span_content_bytes[dedup_idx]` was computed from pre-redaction
    // `content.len()` in `build_dedup_batch`. Redaction mutates `content` in
    // place, so any opted-in span's entry must be corrected before the
    // post-dedup input-bytes loop reads it. Track the message → dedup_idx
    // back-reference here so we can apply the delta on write-back.
    let mut msg_to_dedup_idx: HashMap<usize, usize> = HashMap::new();

    for (dedup_idx, &span_idx) in recordable_indices.iter().enumerate() {
        if !*opt_in_for_span.get(&span_idx).unwrap_or(&false) {
            continue;
        }
        let span = &spans[span_idx];

        // Dedup'd LLM span: redact each new message via the dedup batch,
        // which is the same buffer Quickwit indexing reads.
        let new_msg_indices = dedup
            .span_new_message_indices
            .get(dedup_idx)
            .cloned()
            .unwrap_or_default();
        for msg_idx in new_msg_indices {
            let Some(msg) = dedup.messages.get(msg_idx) else {
                continue;
            };
            msg_to_dedup_idx.insert(msg_idx, dedup_idx);
            targets.push(Target::DedupMessage(msg_idx));
            texts.push(msg.content.clone());
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

    let redacted = match client.redact(texts).await {
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
                if let Some(msg) = dedup.messages.get_mut(idx) {
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
                    if let Some(&dedup_idx) = msg_to_dedup_idx.get(&idx)
                        && let Some(slot) = dedup.span_content_bytes.get_mut(dedup_idx)
                    {
                        *slot = slot.saturating_sub(old_len).saturating_add(new_len);
                    }
                }
            }
        }
    }
}
