//! PII redaction at ingest: one redactor RPC per batch, with the results
//! routed back to the three places span text lives before it is stored or
//! indexed. What happens to each depends on the project's [`PiiMode`]:
//!
//! | text                    | `off`     | `redact`            | `dual`                           |
//! |-------------------------|-----------|---------------------|----------------------------------|
//! | whole `input`/`output`  | untouched | spliced into `Span` | raw; text+masks via `PiiOutcome` |
//! | `unique_content` row    | untouched | spliced in place    | canonical text+masks in place    |
//! | trace-new search buffer | untouched | spliced in place    | spliced in place                 |
//! | stored `pii_checked`    | `false`   | `true`              | `true`                           |
//!
//! "Spliced" is `[REDACTED_<LABEL>]` written over each mask
//! ([`MaskedText::redacted`]). A `dual` whole value cannot go back into
//! `Span`: `Span.input` is a `serde_json::Value` and re-serializing it would
//! move the byte offsets the masks index, so the raw `Span` (read by realtime
//! and everything else) and the `MaskedText` in [`PiiOutcome`] (written
//! verbatim to `CHSpan`) coexist. Search buffers get spliced text in every
//! mode so Quickwit never sees raw `dual` text.
//!
//! Failure (RPC error, oversize, unparsable canonical text, malformed masks)
//! leaves the span or row as it arrived and unchecked (`pii_checked =
//! false`), which the masked read path renders as unavailable. A failed
//! `unique_content` row gets no `s2:` mark so the next occurrence re-inserts
//! it; a failed `dual` span gets no `tn:` marks and no text in its Quickwit
//! document ([`PiiOutcome::is_indexable`]). A failed `redact` span stays
//! indexable: its raw text is stored for every reader anyway. Redactor
//! failures never block ingestion; a failed *mode lookup* does fail the
//! batch ([`resolve_project_pii_modes`]), since a span stored on a guessed
//! mode is permanent while a retry is not.
//!
//! Two index spaces meet here: `span_idx` is a position in the batch's
//! `spans` slice and keys [`PiiOutcome`]; `dedup_idx` is a position in
//! `recordable_indices` and indexes the trace-new buffers
//! (`recordable_indices[dedup_idx] == span_idx`). Shared rows are indexed by
//! position in `shared_content`, unrelated to either.

use std::borrow::Cow;
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

/// Effective PII mode of every project a recordable span in the batch
/// belongs to. Built by [`resolve_project_pii_modes`]; a batch whose modes
/// could not all be resolved never gets one.
#[derive(Debug, Default)]
pub struct ProjectModes(HashMap<Uuid, PiiMode>);

impl ProjectModes {
    /// A project the batch did not resolve reads as `dual`, the strictest.
    /// Unreachable when the map came from [`resolve_project_pii_modes`].
    pub fn get(&self, project_id: &Uuid) -> PiiMode {
        self.0.get(project_id).copied().unwrap_or(PiiMode::Dual)
    }
}

impl From<HashMap<Uuid, PiiMode>> for ProjectModes {
    fn from(modes: HashMap<Uuid, PiiMode>) -> Self {
        Self(modes)
    }
}

/// Per-span verdict for the ClickHouse row and the Quickwit document.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SpanPii {
    /// The project's mode as resolved for this batch.
    pub mode: PiiMode,
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

impl SpanPii {
    fn new(mode: PiiMode) -> Self {
        Self {
            mode,
            checked: false,
            input: None,
            output: None,
        }
    }

    /// Redaction was attempted and did not complete. `off` spans are
    /// unchecked but were never attempted.
    pub fn failed(&self) -> bool {
        self.mode != PiiMode::Off && !self.checked
    }

    /// The stored text is raw and hidden only by the read policy. `redact`
    /// text is already safe for everyone, and `off` text is raw by the
    /// project's own choice.
    fn policy_hidden(&self) -> bool {
        self.mode == PiiMode::Dual
    }
}

/// Result of one batch pass: one [`SpanPii`] per recordable span.
#[derive(Debug, Default)]
pub struct PiiOutcome {
    /// Keyed by `span_idx` (position in the batch's `spans` slice).
    spans: HashMap<usize, SpanPii>,
    /// Positions in the `shared_content` slice whose redaction did not
    /// complete. These must not be stamped storage-present so the next
    /// occurrence re-inserts.
    failed_shared_rows: HashSet<usize>,
}

impl PiiOutcome {
    /// Verdicts for a batch no redactor will see: every span is unchecked,
    /// so non-`off` spans read as failed and policy-hidden ones stay out of
    /// the index. Shared rows keep their storage marks: with no redactor
    /// configured, re-inserting them on every occurrence would heal nothing.
    pub fn without_redactor(
        spans: &[Span],
        recordable_indices: &[usize],
        project_modes: &ProjectModes,
    ) -> Self {
        let mut outcome = Self::default();
        for &span_idx in recordable_indices {
            let mode = project_modes.get(&spans[span_idx].project_id);
            outcome.spans.insert(span_idx, SpanPii::new(mode));
        }
        outcome
    }

    /// A span this batch never saw reads as `dual` and unchecked, i.e.
    /// fail-closed.
    pub fn span(&self, span_idx: usize) -> SpanPii {
        self.spans
            .get(&span_idx)
            .cloned()
            .unwrap_or_else(|| SpanPii::new(PiiMode::Dual))
    }

    /// `span` with masks spliced into any whole-value field the redactor
    /// flagged; borrowed when there is nothing to splice. Trace-new messages
    /// were redacted in place already, and [`Self::is_indexable`] still
    /// gates the document as a whole.
    pub fn index_view<'a>(&self, span_idx: usize, span: &'a Span) -> Cow<'a, Span> {
        let Some(pii) = self.spans.get(&span_idx) else {
            return Cow::Borrowed(span);
        };
        let input = pii.input.as_ref().filter(|m| m.has_pii());
        let output = pii.output.as_ref().filter(|m| m.has_pii());
        if input.is_none() && output.is_none() {
            return Cow::Borrowed(span);
        }
        let mut owned = span.clone();
        if let Some(m) = input {
            owned.input = m.redacted_value();
        }
        if let Some(m) = output {
            owned.output = m.redacted_value();
        }
        Cow::Owned(owned)
    }

    /// Whether the span's text may reach the search index: a failed
    /// policy-hidden span holds PII that no redacted copy shadows.
    pub fn is_indexable(&self, span_idx: usize) -> bool {
        self.spans
            .get(&span_idx)
            .is_some_and(|pii| !(pii.policy_hidden() && pii.failed()))
    }

    pub fn shared_row_failed(&self, row_idx: usize) -> bool {
        self.failed_shared_rows.contains(&row_idx)
    }

    /// Optimistic mark before the RPC; any later `fail` wins.
    fn check(&mut self, span_idx: usize) {
        if let Some(pii) = self.spans.get_mut(&span_idx) {
            pii.checked = true;
        }
    }

    /// A span with no entry is recorded as `dual` so it fails closed.
    fn fail(&mut self, span_idx: usize) {
        self.spans
            .entry(span_idx)
            .or_insert_with(|| SpanPii::new(PiiMode::Dual))
            .checked = false;
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
/// through the cached billing-info path so repeat batches are free. A failed
/// lookup is an error: the caller cannot tell whether the project is
/// protected, and storing its spans on a guess would be permanent, so the
/// batch is retried instead.
pub async fn resolve_project_pii_modes(
    spans: &[Span],
    recordable_indices: &[usize],
    db: Arc<DB>,
    cache: Arc<Cache>,
) -> Result<ProjectModes> {
    let unique: HashSet<Uuid> = recordable_indices
        .iter()
        .map(|&i| spans[i].project_id)
        .collect();
    let mut modes = HashMap::with_capacity(unique.len());
    for project_id in unique {
        let mode = get_workspace_info_for_project_id(db.clone(), cache.clone(), project_id)
            .await
            .map_err(|e| anyhow!("lookup project[{project_id}] settings: {e:#}"))?
            // Unknown project: nothing to protect.
            .map_or(PiiMode::Off, |info| info.settings.pii_mode());
        modes.insert(project_id, mode);
    }
    Ok(ProjectModes(modes))
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
/// masks (byte ranges into it); the module doc has the per-mode routing
/// matrix. `dual` text is not passed through `sanitize_string` again because
/// that would shift the offsets (inputs are sanitized before the RPC
/// instead).
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
    project_modes: &ProjectModes,
) -> PiiOutcome {
    let mut outcome = PiiOutcome::default();

    let mut targets: Vec<Target> = Vec::new();
    let mut texts: Vec<String> = Vec::new();

    for (idx, row) in shared_content.iter_mut().enumerate() {
        if project_modes.get(&row.project_id) != PiiMode::Off {
            targets.push(Target::SharedRow(idx));
            texts.push(row.content.clone());
        }
    }

    for (dedup_idx, &span_idx) in recordable_indices.iter().enumerate() {
        let span = &spans[span_idx];
        let mode = project_modes.get(&span.project_id);
        outcome.spans.insert(span_idx, SpanPii::new(mode));
        if mode == PiiMode::Off {
            continue;
        }
        // A span with nothing to check is safe by definition.
        outcome.check(span_idx);

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
                match project_modes.get(&spans[idx].project_id) {
                    PiiMode::Dual => {
                        if let Err(e) = masked.validate_for_storage() {
                            log::warn!("pii-redactor: canonical span[{idx}]: {e:#}");
                            outcome.fail(idx);
                            continue;
                        }
                        let Some(entry) = outcome.spans.get_mut(&idx) else {
                            continue;
                        };
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
                match project_modes.get(&row.project_id) {
                    PiiMode::Dual => {
                        if let Err(e) = masked.validate_for_storage() {
                            log::warn!("pii-redactor: shared row[{idx}]: {e:#}");
                            outcome.failed_shared_rows.insert(idx);
                            continue;
                        }
                        row.content_masks = masked.ch_masks();
                        row.content = masked.text;
                    }
                    // Spliced text is re-sanitized to match the non-redact
                    // path's `sanitize_string(&item.to_string())`. It must
                    // still be JSON: the view splices the row into a message
                    // array.
                    _ => match masked.redacted().and_then(|text| {
                        serde_json::from_str::<IgnoredAny>(&text)
                            .map_err(|e| anyhow!("redacted text is not JSON: {e}"))?;
                        Ok(text)
                    }) {
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
