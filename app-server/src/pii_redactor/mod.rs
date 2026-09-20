use std::collections::{HashMap, HashSet};
use std::future::Future;
use std::sync::Arc;

use anyhow::{Result, anyhow};
use tonic::transport::Channel;
use tracing::Instrument;
use uuid::Uuid;

use crate::cache::Cache;
use crate::ch::unique_content::CHUniqueContent;
use crate::db::DB;
use crate::db::projects::PiiMode;
use crate::db::spans::Span;
use crate::utils::limits::get_workspace_info_for_project_id;
use crate::utils::sanitize_string;

pub mod masks;
#[allow(clippy::all)]
pub mod pii_redactor;

pub use masks::MaskedText;
#[cfg(test)]
pub use masks::PiiMask;
use pii_redactor::{RedactRequest, pii_redactor_service_client::PiiRedactorServiceClient};

/// Redaction backend. The gRPC client is the production impl; tests plug in
/// a fake so the state machine in [`redact_spans_in_place`] is unit-testable.
pub trait RedactTexts {
    /// Detect PII in stringified-JSON texts, preserving order and length.
    /// Each result is the text's canonical re-serialization plus masks.
    fn redact(&self, texts: Vec<String>) -> impl Future<Output = Result<Vec<MaskedText>>> + Send;
}

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
}

impl RedactTexts for PiiRedactorClient {
    async fn redact(&self, texts: Vec<String>) -> Result<Vec<MaskedText>> {
        if texts.is_empty() {
            return Ok(Vec::new());
        }
        let mut client = self.client.as_ref().clone();
        let req = RedactRequest {
            texts,
            skip_keys: Vec::new(),
        };
        let resp = client
            .redact(tonic::Request::new(req))
            .await
            .map_err(|e| anyhow!("pii-redactor rpc: {}", e.message()))?
            .into_inner();
        Ok(resp.results.into_iter().map(MaskedText::from).collect())
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
    /// One row of the `unique_content` CH buffer. Redacted content is
    /// inserted into ClickHouse on the next step; same content also lives
    /// in some span's `span_trace_new_contents` (under
    /// [`Target::TraceNew`]), redacted independently in the same RPC.
    SharedRow(usize),
    /// One trace-new message (input or output) that Quickwit indexes for
    /// per-trace first-occurrence search. `(direction, dedup_idx, offset)`
    /// addresses `span_trace_new_contents[dedup_idx][offset]` in the
    /// matching direction view. Always redacted regardless of
    /// storage-miss vs storage-hit, so cross-trace shared content is
    /// redacted before indexing.
    TraceNew(Dir, usize, usize),
}

#[derive(Clone, Copy)]
enum Dir {
    Input,
    Output,
}

/// PII mode for every unique project in `recordable_indices`, through the
/// cached billing-info path so repeat batches are free. `None` means the
/// lookup failed: the caller cannot tell whether the project is protected,
/// so its spans are skipped.
pub async fn resolve_project_pii_modes(
    spans: &[Span],
    recordable_indices: &[usize],
    db: Arc<DB>,
    cache: Arc<Cache>,
) -> HashMap<Uuid, Option<PiiMode>> {
    let unique: HashSet<Uuid> = recordable_indices
        .iter()
        .map(|&i| spans[i].project_id)
        .collect();
    let mut modes = HashMap::with_capacity(unique.len());
    for project_id in unique {
        let mode =
            match get_workspace_info_for_project_id(db.clone(), cache.clone(), project_id).await {
                Ok(Some(info)) => Some(info.settings.pii_mode()),
                // Unknown project: nothing to protect.
                Ok(None) => Some(PiiMode::Off),
                Err(e) => {
                    log::warn!("pii-redactor: lookup project[{project_id}] settings: {e:#}");
                    None
                }
            };
        modes.insert(project_id, mode);
    }
    modes
}

/// Whether the project's spans go through the redactor. `dual` is ingested
/// like `redact` until the mask columns exist.
fn is_redacted(project_modes: &HashMap<Uuid, Option<PiiMode>>, project_id: &Uuid) -> bool {
    matches!(
        project_modes.get(project_id),
        Some(Some(PiiMode::Redact | PiiMode::Dual))
    )
}

/// Redact `span.input` / `span.output` for every span whose project is in
/// `redact` or `dual` mode. Three buffer kinds are redacted in lockstep:
///
/// - **Whole `span.input` / `span.output`**: kept on root spans for the
///   trace-list preview and on non-LLM / non-array-input spans.
/// - **`SharedContentBatch` rows**: every row about to be inserted into
///   the CH `unique_content` table.
/// - **Per-span `span_trace_new_contents`**: the per-span Quickwit
///   indexing buffer. Covers ALL trace-new positions (storage-miss AND
///   storage-hit-but-trace-new), so cross-trace shared content is
///   redacted before indexing.
///
/// The redactor returns each text's canonical re-serialization plus PII
/// masks (byte ranges into it); the masks are spliced here
/// (`MaskedText::redacted`) and the result overwrites the raw buffer.
/// Texts are sanitized before the RPC, like `CHSpan::from_db_span` does,
/// so what the redactor sees is what would have been stored.
///
/// Storage-miss content is duplicated across the shared rows and
/// `span_trace_new_contents`; both copies are redacted independently
/// (sent twice to the redactor RPC). Acceptable cost — storage-miss is
/// the common case but the wire shape favors correctness over RPC count.
/// Already-seen-in-trace messages aren't in any of these buffers and
/// were redacted on first emit. Tool-definition blobs share the
/// shared-row buffer and are redacted along with messages (the redactor
/// is a no-op on schemas).
///
/// MUST run after `MessageBatch::build` (input + output) and BEFORE the
/// `unique_content` ClickHouse insert / Quickwit indexing.
///
/// Best-effort: any RPC, parse or mask failure is logged and the affected
/// buffers are left untouched — PII redaction must never block trace
/// ingestion.
///
/// `input_trace_new_contents` / `output_trace_new_contents` are the per-span
/// trace-new content buffers Quickwit indexes, indexed by `dedup_idx` (matching
/// `recordable_indices`).
///
/// Note: byte-billing accuracy for PII-redacted content is slightly off because
/// `span_content_bytes` is computed pre-redaction; an opted-in project pays for
/// the raw size of storage-miss content rather than the redacted size. The
/// over-bill is bounded by the redactor's shrinkage, typically small (a few
/// percent), so we accept it for design simplicity rather than threading the
/// byte-delta back through the dedup path.
pub async fn redact_spans_in_place<R: RedactTexts>(
    client: &R,
    spans: &mut [Span],
    shared_content: &mut [CHUniqueContent],
    input_trace_new_contents: &mut [Vec<String>],
    output_trace_new_contents: &mut [Vec<String>],
    recordable_indices: &[usize],
    project_modes: &HashMap<Uuid, Option<PiiMode>>,
) {
    if !project_modes
        .values()
        .any(|m| matches!(m, Some(PiiMode::Redact | PiiMode::Dual)))
    {
        return;
    }

    let mut targets: Vec<Target> = Vec::new();
    let mut texts: Vec<String> = Vec::new();

    for (idx, row) in shared_content.iter().enumerate() {
        if is_redacted(project_modes, &row.project_id) {
            targets.push(Target::SharedRow(idx));
            texts.push(row.content.clone());
        }
    }

    for (dedup_idx, &span_idx) in recordable_indices.iter().enumerate() {
        let span = &spans[span_idx];
        if !is_redacted(project_modes, &span.project_id) {
            continue;
        }

        if let Some(contents) = input_trace_new_contents.get(dedup_idx) {
            for (offset, c) in contents.iter().enumerate() {
                targets.push(Target::TraceNew(Dir::Input, dedup_idx, offset));
                texts.push(c.clone());
            }
        }
        if let Some(contents) = output_trace_new_contents.get(dedup_idx) {
            for (offset, c) in contents.iter().enumerate() {
                targets.push(Target::TraceNew(Dir::Output, dedup_idx, offset));
                texts.push(c.clone());
            }
        }

        // Producer-side dedup strips `span.input` to `None` for nested LLM
        // spans (those ride the wire as hashes only), so this covers root
        // LLM spans kept for the trace-list preview and non-LLM spans.
        if let Some(input) = span.input.as_ref() {
            targets.push(Target::Input(span_idx));
            texts.push(sanitize_string(&input.to_string()));
        }
        if let Some(output) = span.output.as_ref() {
            targets.push(Target::Output(span_idx));
            texts.push(sanitize_string(&output.to_string()));
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
        Ok(r) if r.len() == targets.len() => r,
        Ok(r) => {
            log::error!(
                "pii-redactor: response len {} != request len {}; skipping",
                r.len(),
                targets.len()
            );
            return;
        }
        Err(e) => {
            log::error!(
                "pii-redactor: skipping batch of {} fields: {e:#}",
                targets.len()
            );
            return;
        }
    };

    for (target, masked) in targets.into_iter().zip(redacted) {
        let text = match masked.redacted() {
            Ok(text) => text,
            Err(e) => {
                log::warn!("pii-redactor: {e:#}; field left as-is");
                continue;
            }
        };
        match target {
            Target::Input(idx) => match serde_json::from_str(&text) {
                Ok(v) => spans[idx].input = Some(v),
                Err(e) => log::warn!("pii-redactor: parse redacted span[{idx}].input: {e:#}"),
            },
            Target::Output(idx) => match serde_json::from_str(&text) {
                Ok(v) => spans[idx].output = Some(v),
                Err(e) => log::warn!("pii-redactor: parse redacted span[{idx}].output: {e:#}"),
            },
            // Spliced text is re-sanitized to match the non-redact path's
            // `sanitize_string(&item.to_string())`.
            Target::SharedRow(idx) => {
                if let Some(row) = shared_content.get_mut(idx) {
                    row.content = sanitize_string(&text);
                }
            }
            Target::TraceNew(dir, dedup_idx, offset) => {
                let contents_for_span = match dir {
                    Dir::Input => input_trace_new_contents.get_mut(dedup_idx),
                    Dir::Output => output_trace_new_contents.get_mut(dedup_idx),
                };
                if let Some(c) = contents_for_span.and_then(|v| v.get_mut(offset)) {
                    *c = sanitize_string(&text);
                }
            }
        }
    }
}

#[cfg(test)]
mod tests;
