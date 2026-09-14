use std::collections::{HashMap, HashSet};
use std::future::Future;
use std::sync::Arc;

use anyhow::{Result, anyhow};
use serde::de::IgnoredAny;
use serde_json::Value;
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

/// Per-span verdict for the ClickHouse row and the Quickwit document.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct SpanPii {
    /// Persisted as `pii_checked`: the redactor screened every text of this
    /// span. In `redact` mode the raw text was replaced; in `dual` mode the
    /// masks say exactly where PII sits, so a checked row with no masks is
    /// safe as-is. `false` for `off` projects and for any failure; the
    /// masked read path treats unchecked rows as unavailable.
    pub checked: bool,
    /// Canonical whole `span.input` with its masks; `dual` mode only.
    /// Written verbatim as `CHSpan::input` / `input_masks` — the masks
    /// index this exact string.
    pub input: Option<MaskedText>,
    /// Same for `span.output`.
    pub output: Option<MaskedText>,
}

/// Result of one batch pass. Spans of `off` projects are absent and read
/// back as unchecked.
#[derive(Debug, Default)]
pub struct PiiOutcome {
    spans: HashMap<usize, SpanPii>,
    /// Spans whose stored text stays raw and is hidden only by the read
    /// policy: `dual` projects, and projects whose mode is unknown (assumed
    /// `dual`). A failure here must keep the text out of the search index.
    raw_stored_spans: HashSet<usize>,
    /// Spans whose redaction did not complete (distinct from `off` spans,
    /// which were never attempted).
    failed_spans: HashSet<usize>,
    /// `shared_content` indices whose redaction did not complete. These must
    /// not be stamped storage-present so the next occurrence re-inserts.
    failed_shared_rows: HashSet<usize>,
}

impl PiiOutcome {
    /// Verdicts for a batch no redactor will see: every span of a non-`off`
    /// project is unchecked, and raw-stored spans are kept out of the index.
    /// Shared rows keep their storage marks: with no redactor configured,
    /// re-inserting them on every occurrence would heal nothing.
    pub fn without_redactor(
        spans: &[Span],
        recordable_indices: &[usize],
        project_modes: &HashMap<Uuid, Option<PiiMode>>,
    ) -> Self {
        let mut outcome = Self::default();
        for &span_idx in recordable_indices {
            let mode = project_modes
                .get(&spans[span_idx].project_id)
                .copied()
                .flatten();
            if mode == Some(PiiMode::Off) {
                continue;
            }
            outcome.fail(span_idx);
            if mode != Some(PiiMode::Redact) {
                outcome.raw_stored_spans.insert(span_idx);
            }
        }
        outcome
    }

    pub fn span(&self, span_idx: usize) -> SpanPii {
        self.spans.get(&span_idx).cloned().unwrap_or_default()
    }

    /// Whether the span's text may reach the search index: a failed
    /// raw-stored span holds PII that no redacted copy shadows.
    pub fn is_indexable(&self, span_idx: usize) -> bool {
        !(self.raw_stored_spans.contains(&span_idx) && self.failed_spans.contains(&span_idx))
    }

    pub fn shared_row_failed(&self, row_idx: usize) -> bool {
        self.failed_shared_rows.contains(&row_idx)
    }

    /// Optimistic mark before the RPC; any later `fail` wins.
    fn check(&mut self, span_idx: usize) {
        let entry = self.spans.entry(span_idx).or_default();
        entry.checked = !self.failed_spans.contains(&span_idx);
    }

    fn fail(&mut self, span_idx: usize) {
        self.failed_spans.insert(span_idx);
        self.spans.entry(span_idx).or_default().checked = false;
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

/// Effective PII mode for every unique project in `recordable_indices`,
/// through the cached billing-info path so repeat batches are free. `None`
/// means the lookup failed: the caller cannot tell whether the project is
/// protected, so its spans are left unchecked and skipped.
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

/// Run PII redaction for every span whose project is in `redact` or `dual`
/// mode and return the per-span verdicts. Three buffer kinds are walked in
/// lockstep:
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
/// masks (byte ranges into it). `redact` mode overwrites the raw buffers
/// with the masks spliced in (the stored text IS the safe text). `dual`
/// mode stores the canonical text verbatim next to its masks and ClickHouse
/// splices at read time; the text is not passed through `sanitize_string`
/// again because that would shift the offsets (inputs are sanitized before
/// the RPC instead). Both stamp `pii_checked`; the Quickwit buffers get the
/// spliced text in both modes so the search index only ever sees redacted
/// text. Any RPC, parse or mask failure leaves the affected rows unchecked
/// and the raw buffers untouched: redaction must never block ingestion,
/// unchecked rows fail closed under a masking policy, and failed shared
/// rows are not stamped in the dedup presence cache, so the next occurrence
/// retries.
///
/// Storage-miss content is duplicated across the shared rows and
/// `span_trace_new_contents`; both copies are redacted independently
/// (sent twice to the redactor RPC). Acceptable cost — storage-miss is the
/// common case but the wire shape favors correctness over RPC count.
/// Tool-definition blobs share the shared-row buffer and are redacted
/// along with messages (the redactor is a no-op on schemas).
///
/// MUST run after `MessageBatch::build` (input + output) and BEFORE the
/// `unique_content` ClickHouse insert / Quickwit indexing.
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
) -> PiiOutcome {
    let mut outcome = PiiOutcome::default();
    let mode_for = |project_id: &Uuid| project_modes.get(project_id).copied().flatten();

    let mut targets: Vec<Target> = Vec::new();
    let mut texts: Vec<String> = Vec::new();

    for (idx, row) in shared_content.iter_mut().enumerate() {
        match mode_for(&row.project_id) {
            Some(PiiMode::Off) => {}
            Some(_) => {
                targets.push(Target::SharedRow(idx));
                texts.push(row.content.clone());
            }
            None => {
                outcome.failed_shared_rows.insert(idx);
            }
        }
    }

    for (dedup_idx, &span_idx) in recordable_indices.iter().enumerate() {
        let span = &spans[span_idx];
        let mode = match mode_for(&span.project_id) {
            Some(PiiMode::Off) => continue,
            Some(mode) => mode,
            // Unknown mode: the project may be `dual`, so its raw text must
            // not be indexed either.
            None => {
                outcome.fail(span_idx);
                outcome.raw_stored_spans.insert(span_idx);
                continue;
            }
        };
        // A span with nothing to check is safe by definition.
        outcome.check(span_idx);
        if mode == PiiMode::Dual {
            outcome.raw_stored_spans.insert(span_idx);
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
        // Sanitized here, like `CHSpan::from_db_span` does, so the canonical
        // response can be stored as-is (shared rows arrive pre-sanitized).
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
        return outcome;
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
                "pii-redactor: response len {} != request len {}; batch stamped failed",
                r.len(),
                targets.len()
            );
            fail_all(&targets, recordable_indices, &mut outcome);
            return outcome;
        }
        Err(e) => {
            log::error!(
                "pii-redactor: batch of {} fields stamped failed: {e:#}",
                targets.len()
            );
            fail_all(&targets, recordable_indices, &mut outcome);
            return outcome;
        }
    };

    for (target, masked) in targets.into_iter().zip(redacted) {
        let is_input = matches!(target, Target::Input(_));
        match target {
            Target::Input(idx) | Target::Output(idx) => {
                let mode = mode_for(&spans[idx].project_id).unwrap_or(PiiMode::Redact);
                match mode {
                    PiiMode::Dual => {
                        // Stored verbatim; check it is the JSON the view
                        // will hand out and that the masks can be spliced.
                        if let Err(e) = serde_json::from_str::<IgnoredAny>(&masked.text)
                            .map_err(anyhow::Error::from)
                            .and_then(|_| masked.validate())
                        {
                            log::warn!("pii-redactor: canonical span[{idx}]: {e:#}");
                            outcome.fail(idx);
                            continue;
                        }
                        let entry = outcome.spans.entry(idx).or_default();
                        if is_input {
                            entry.input = Some(masked);
                        } else {
                            entry.output = Some(masked);
                        }
                    }
                    _ => {
                        let value: Value = match masked
                            .redacted()
                            .and_then(|t| serde_json::from_str(&t).map_err(Into::into))
                        {
                            Ok(v) => v,
                            Err(e) => {
                                log::warn!("pii-redactor: redacted span[{idx}] text: {e:#}");
                                outcome.fail(idx);
                                continue;
                            }
                        };
                        if is_input {
                            spans[idx].input = Some(value);
                        } else {
                            spans[idx].output = Some(value);
                        }
                    }
                }
            }
            Target::SharedRow(idx) => {
                let Some(row) = shared_content.get_mut(idx) else {
                    continue;
                };
                match mode_for(&row.project_id) {
                    Some(PiiMode::Dual) => {
                        if let Err(e) = masked.validate() {
                            log::warn!("pii-redactor: shared row[{idx}]: {e:#}");
                            outcome.failed_shared_rows.insert(idx);
                            continue;
                        }
                        row.content_masks = masked.ch_masks();
                        row.content = masked.text;
                    }
                    // Spliced text is re-sanitized to match the non-redact
                    // path's `sanitize_string(&item.to_string())`.
                    _ => match masked.redacted() {
                        Ok(text) => row.content = sanitize_string(&text),
                        Err(e) => {
                            log::warn!("pii-redactor: shared row[{idx}]: {e:#}");
                            outcome.failed_shared_rows.insert(idx);
                            continue;
                        }
                    },
                }
                row.pii_checked = true;
            }
            Target::TraceNew(dir, dedup_idx, offset) => {
                let contents_for_span = match dir {
                    Dir::Input => input_trace_new_contents.get_mut(dedup_idx),
                    Dir::Output => output_trace_new_contents.get_mut(dedup_idx),
                };
                let Some(c) = contents_for_span.and_then(|v| v.get_mut(offset)) else {
                    continue;
                };
                match masked.redacted() {
                    Ok(text) => *c = sanitize_string(&text),
                    Err(e) => {
                        log::warn!("pii-redactor: trace-new content[{dedup_idx}][{offset}]: {e:#}");
                        if let Some(&span_idx) = recordable_indices.get(dedup_idx) {
                            outcome.fail(span_idx);
                        }
                    }
                }
            }
        }
    }

    outcome
}

/// Mark every row and span the aborted RPC covered as failed.
fn fail_all(targets: &[Target], recordable_indices: &[usize], outcome: &mut PiiOutcome) {
    for target in targets {
        match target {
            Target::Input(idx) | Target::Output(idx) => outcome.fail(*idx),
            Target::SharedRow(idx) => {
                outcome.failed_shared_rows.insert(*idx);
            }
            Target::TraceNew(_, dedup_idx, _) => {
                if let Some(&span_idx) = recordable_indices.get(*dedup_idx) {
                    outcome.fail(span_idx);
                }
            }
        }
    }
}

#[cfg(test)]
mod tests;
