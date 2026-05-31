use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use anyhow::{Result, anyhow};
use tonic::transport::Channel;
use tracing::Instrument;
use uuid::Uuid;

use crate::cache::Cache;
use crate::ch::deduped_content::CHDedupedContent;
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
    /// One row of the `shared_content` CH buffer. Redacted content is
    /// inserted into ClickHouse on the next step; same content also lives
    /// in some span's `span_trace_new_contents` (under
    /// [`Target::TraceNew`]), redacted independently in the same RPC.
    SharedRow(usize),
    /// One trace-new message (input or output) that Quickwit indexes for
    /// per-trace first-occurrence search. `(direction, dedup_idx, offset)`
    /// addresses `span_trace_new_contents[dedup_idx][offset]` in the
    /// matching direction view. Always redacted regardless of
    /// storage-miss vs storage-hit (the bug we fixed: storage-hit + trace-
    /// new content was previously dropped from Quickwit indexing).
    TraceNew(Dir, usize, usize),
}

#[derive(Clone, Copy)]
enum Dir {
    Input,
    Output,
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
/// needs to walk: the per-span trace-new content buffer that Quickwit
/// indexes. Indexed by `dedup_idx` (matching `recordable_indices`).
///
/// Note: byte-billing accuracy for PII-redacted content is slightly off
/// because `span_content_bytes` is computed pre-redaction; an opted-in
/// project pays for the raw size of storage-miss content rather than
/// the redacted size. The over-bill is bounded by the redactor's
/// shrinkage, typically small (a few percent), so we accept it for
/// design simplicity rather than threading the byte-delta back through
/// the dedup path.
pub struct DedupRedactionView<'a> {
    pub span_trace_new_contents: &'a mut [Vec<String>],
}

/// Redact `span.input` / `span.output` for every span whose project has
/// `remove_pii=true`. Three buffer kinds are redacted in lockstep:
///
/// - **Whole `span.input` / `span.output`**: kept on root spans for the
///   trace-list preview and on non-LLM / non-array-input spans.
/// - **`shared_content` rows**: every row about to be inserted into the
///   CH `shared_content` table.
/// - **Per-span `span_trace_new_contents`**: the per-span Quickwit
///   indexing buffer. Covers ALL trace-new positions (storage-miss AND
///   storage-hit-but-trace-new), so cross-trace shared content is
///   redacted before indexing.
///
/// Storage-miss content is duplicated across `shared_content` and
/// `span_trace_new_contents`; both copies are redacted independently
/// (sent twice to the redactor RPC). Acceptable cost — storage-miss is
/// the common case but the wire shape favors correctness over RPC count.
/// Already-seen-in-trace messages aren't in any of these buffers and
/// were redacted on first emit. Tool-definition blobs share the
/// `shared_content` buffer but are NOT walked here (tool definitions
/// are schemas, not user text).
///
/// MUST run after `build_dedup_batch` (input + output) and BEFORE the
/// `shared_content` ClickHouse insert / Quickwit indexing.
///
/// Best-effort: any RPC failure is logged and the batch is left untouched —
/// PII redaction must never block trace ingestion.
pub async fn redact_spans_in_place(
    client: &PiiRedactorClient,
    spans: &mut [Span],
    shared_content: &mut Vec<CHDedupedContent>,
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

    // Walk the `shared_content` rows that belong to opted-in projects.
    for (idx, msg) in shared_content.iter().enumerate() {
        if opted_in.contains(&msg.project_id) {
            targets.push(Target::SharedRow(idx));
            texts.push(msg.content.clone());
        }
    }

    for (dedup_idx, &span_idx) in recordable_indices.iter().enumerate() {
        if !*opt_in_for_span.get(&span_idx).unwrap_or(&false) {
            continue;
        }
        let span = &spans[span_idx];

        // Dedup'd LLM input: redact each trace-new content position so
        // Quickwit's per-trace indexer sees redacted content. Includes
        // storage-hit + trace-new content (cross-trace case).
        if let Some(contents) = input_view.span_trace_new_contents.get(dedup_idx) {
            for (offset, c) in contents.iter().enumerate() {
                targets.push(Target::TraceNew(Dir::Input, dedup_idx, offset));
                texts.push(c.clone());
            }
        }

        // Dedup'd LLM output: same shape as input.
        if let Some(contents) = output_view.span_trace_new_contents.get(dedup_idx) {
            for (offset, c) in contents.iter().enumerate() {
                targets.push(Target::TraceNew(Dir::Output, dedup_idx, offset));
                texts.push(c.clone());
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
        span_trace_new_contents: input_contents,
    } = input_view;
    let DedupRedactionView {
        span_trace_new_contents: output_contents,
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
            Target::SharedRow(idx) => {
                if let Some(msg) = shared_content.get_mut(idx) {
                    // The redactor returns stringified JSON; sanitize to
                    // match the non-redact path's
                    // `sanitize_string(&item.to_string())`.
                    msg.content = sanitize_string(&text);
                }
            }
            Target::TraceNew(dir, dedup_idx, offset) => {
                let contents_for_span = match dir {
                    Dir::Input => input_contents.get_mut(dedup_idx),
                    Dir::Output => output_contents.get_mut(dedup_idx),
                };
                if let Some(c) = contents_for_span.and_then(|v| v.get_mut(offset)) {
                    *c = sanitize_string(&text);
                }
            }
        }
    }
}
