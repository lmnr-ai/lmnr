use std::collections::{HashMap, HashSet};
use std::future::Future;
use std::sync::Arc;

use anyhow::{Result, anyhow};
use serde_json::Value;
use tonic::transport::Channel;
use tracing::Instrument;
use uuid::Uuid;

use crate::cache::Cache;
use crate::ch::deduped_content::CHDedupedContent;
use crate::db::DB;
use crate::db::projects::PiiMode;
use crate::db::spans::Span;
use crate::utils::limits::get_workspace_info_for_project_id;
use crate::utils::sanitize_string;

#[allow(clippy::all)]
pub mod pii_redactor;

use pii_redactor::{RedactRequest, pii_redactor_service_client::PiiRedactorServiceClient};

/// Default placeholder prefix the redactor substitutes for every entity
/// (`[REDACTED_EMAIL]`, ...). Its presence in the response is the "changed"
/// signal: byte equality is useless because the redactor re-serializes JSON.
pub const REDACTED_MARKER: &str = "[REDACTED_";

/// Row-level redaction state, persisted as `pii_state` on `spans` and
/// `deduped_content` (migration 64) and read by the masked branch of
/// `spans_v1`. Only `Clean` and `Redacted` are renderable under a masking
/// policy; the other two fail closed.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum PiiState {
    /// Project is `off`, or the row predates PII states.
    #[default]
    Unchecked = 0,
    /// Raw text is safe: nothing found, or `redact` mode already stripped it.
    Clean = 1,
    /// The `*_redacted` column holds the safe copy.
    Redacted = 2,
    /// Redaction did not complete; raw text may hold PII.
    Failed = 3,
}

impl From<PiiState> for u8 {
    fn from(state: PiiState) -> u8 {
        state as u8
    }
}

/// Redaction backend. The gRPC client is the production impl; tests plug in
/// a fake so the state machine in [`redact_spans_in_place`] is unit-testable.
pub trait RedactTexts {
    /// Redact stringified-JSON texts, preserving order and length.
    fn redact(&self, texts: Vec<String>) -> impl Future<Output = Result<Vec<String>>> + Send;
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

/// Per-span verdict for the ClickHouse row and the Quickwit document.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct SpanPii {
    pub state: PiiState,
    /// Redacted whole `span.input`, sanitized like `CHSpan::input`. Present
    /// only in `dual` mode and only when the redactor changed the text.
    pub input_redacted: Option<String>,
    /// Same for `span.output`.
    pub output_redacted: Option<String>,
}

/// Result of one batch pass. Spans of `off` projects are absent and read
/// back as [`PiiState::Unchecked`].
#[derive(Debug, Default)]
pub struct PiiOutcome {
    spans: HashMap<usize, SpanPii>,
    dual_span_indices: HashSet<usize>,
}

impl PiiOutcome {
    pub fn span(&self, span_idx: usize) -> SpanPii {
        self.spans.get(&span_idx).cloned().unwrap_or_default()
    }

    /// Whether the span's text may reach the search index. Under `dual` a
    /// `failed` span still holds raw PII that no redacted copy shadows.
    pub fn is_indexable(&self, span_idx: usize) -> bool {
        !(self.dual_span_indices.contains(&span_idx)
            && self.span(span_idx).state == PiiState::Failed)
    }

    fn mark(&mut self, span_idx: usize, state: PiiState) {
        let entry = self.spans.entry(span_idx).or_default();
        entry.state = combine(entry.state, state);
    }
}

/// `Failed` dominates, then `Redacted`, then `Clean`.
fn combine(a: PiiState, b: PiiState) -> PiiState {
    match (a, b) {
        (PiiState::Failed, _) | (_, PiiState::Failed) => PiiState::Failed,
        (PiiState::Redacted, _) | (_, PiiState::Redacted) => PiiState::Redacted,
        (PiiState::Clean, _) | (_, PiiState::Clean) => PiiState::Clean,
        _ => PiiState::Unchecked,
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
/// protected, so its spans are stamped `Failed` and skipped.
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
                Ok(Some(info)) => Some(info.settings.effective_pii_mode()),
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
/// - **`shared_content` rows**: every row about to be inserted into the
///   CH `deduped_content` table.
/// - **Per-span `span_trace_new_contents`**: the per-span Quickwit
///   indexing buffer. Covers ALL trace-new positions (storage-miss AND
///   storage-hit-but-trace-new), so cross-trace shared content is
///   redacted before indexing.
///
/// `redact` mode overwrites the raw buffers and stamps `Clean` (the stored
/// text IS the safe text). `dual` mode leaves `span.*` and `shared_content
/// .content` raw, fills the `*_redacted` companions only where the redactor
/// changed something, and stamps `Clean` / `Redacted`; the Quickwit buffers
/// are overwritten in both modes so the search index only ever sees
/// redacted text. Any RPC or parse failure stamps `Failed` on everything it
/// covered and leaves the raw buffers untouched: redaction must never block
/// ingestion, and `Failed` rows fail closed under a masking policy and are
/// not stamped in the dedup presence cache, so the next occurrence retries.
///
/// Storage-miss content is duplicated across `shared_content` and
/// `span_trace_new_contents`; both copies are redacted independently
/// (sent twice to the redactor RPC). Acceptable cost — storage-miss is the
/// common case but the wire shape favors correctness over RPC count.
/// Tool-definition blobs share the `shared_content` buffer and are redacted
/// along with messages (the redactor is a no-op on schemas).
///
/// MUST run after `build_dedup_batch` (input + output) and BEFORE the
/// `shared_content` ClickHouse insert / Quickwit indexing.
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
    shared_content: &mut [CHDedupedContent],
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
            None => row.pii_state = PiiState::Failed.into(),
        }
    }

    for (dedup_idx, &span_idx) in recordable_indices.iter().enumerate() {
        let span = &spans[span_idx];
        let mode = match mode_for(&span.project_id) {
            Some(PiiMode::Off) => continue,
            Some(mode) => mode,
            None => {
                outcome.mark(span_idx, PiiState::Failed);
                continue;
            }
        };
        // A span with nothing to check is safe by definition.
        outcome.mark(span_idx, PiiState::Clean);
        if mode == PiiMode::Dual {
            outcome.dual_span_indices.insert(span_idx);
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
            texts.push(input.to_string());
        }
        if let Some(output) = span.output.as_ref() {
            targets.push(Target::Output(span_idx));
            texts.push(output.to_string());
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
            fail_all(&targets, shared_content, recordable_indices, &mut outcome);
            return outcome;
        }
        Err(e) => {
            log::error!(
                "pii-redactor: batch of {} fields stamped failed: {e:#}",
                targets.len()
            );
            fail_all(&targets, shared_content, recordable_indices, &mut outcome);
            return outcome;
        }
    };

    for (target, text) in targets.into_iter().zip(redacted.into_iter()) {
        let changed = text.contains(REDACTED_MARKER);
        let is_input = matches!(target, Target::Input(_));
        match target {
            Target::Input(idx) | Target::Output(idx) => {
                let mode = mode_for(&spans[idx].project_id).unwrap_or(PiiMode::Redact);
                let parsed: Option<Value> = match serde_json::from_str(&text) {
                    Ok(v) => Some(v),
                    Err(e) => {
                        log::warn!("pii-redactor: parse redacted span[{idx}] text: {e:#}");
                        outcome.mark(idx, PiiState::Failed);
                        None
                    }
                };
                let Some(value) = parsed else { continue };
                match mode {
                    PiiMode::Dual => {
                        if changed {
                            let entry = outcome.spans.entry(idx).or_default();
                            let stored = Some(sanitize_string(&value.to_string()));
                            if is_input {
                                entry.input_redacted = stored;
                            } else {
                                entry.output_redacted = stored;
                            }
                            outcome.mark(idx, PiiState::Redacted);
                        }
                    }
                    _ => {
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
                // The redactor returns stringified JSON; sanitize to match
                // the non-redact path's `sanitize_string(&item.to_string())`.
                match mode_for(&row.project_id) {
                    Some(PiiMode::Dual) => {
                        if changed {
                            row.content_redacted = sanitize_string(&text);
                            row.pii_state = PiiState::Redacted.into();
                        } else {
                            row.pii_state = PiiState::Clean.into();
                        }
                    }
                    _ => {
                        row.content = sanitize_string(&text);
                        row.pii_state = PiiState::Clean.into();
                    }
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

    outcome
}

/// Stamp `Failed` on every row and span the aborted RPC covered.
fn fail_all(
    targets: &[Target],
    shared_content: &mut [CHDedupedContent],
    recordable_indices: &[usize],
    outcome: &mut PiiOutcome,
) {
    for target in targets {
        match target {
            Target::Input(idx) | Target::Output(idx) => outcome.mark(*idx, PiiState::Failed),
            Target::SharedRow(idx) => {
                if let Some(row) = shared_content.get_mut(*idx) {
                    row.pii_state = PiiState::Failed.into();
                }
            }
            Target::TraceNew(_, dedup_idx, _) => {
                if let Some(&span_idx) = recordable_indices.get(*dedup_idx) {
                    outcome.mark(span_idx, PiiState::Failed);
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::spans::SpanType;
    use crate::traces::spans::SpanAttributes;
    use chrono::Utc;
    use serde_json::json;
    use std::sync::Mutex;

    /// Replaces every occurrence of `secret` with a placeholder; `fail`
    /// makes the RPC error out.
    struct FakeRedactor {
        fail: bool,
        calls: Mutex<Vec<Vec<String>>>,
    }

    impl FakeRedactor {
        fn new(fail: bool) -> Self {
            Self {
                fail,
                calls: Mutex::new(Vec::new()),
            }
        }
    }

    impl RedactTexts for FakeRedactor {
        async fn redact(&self, texts: Vec<String>) -> Result<Vec<String>> {
            self.calls.lock().unwrap().push(texts.clone());
            if self.fail {
                return Err(anyhow!("down"));
            }
            Ok(texts
                .into_iter()
                .map(|t| t.replace("secret", "[REDACTED_SECRET]"))
                .collect())
        }
    }

    fn span(project_id: Uuid, input: Option<Value>, output: Option<Value>) -> Span {
        Span {
            span_id: Uuid::new_v4(),
            project_id,
            trace_id: Uuid::new_v4(),
            parent_span_id: None,
            name: "s".into(),
            attributes: SpanAttributes::new(Default::default()),
            input,
            output,
            span_type: SpanType::Default,
            start_time: Utc::now(),
            end_time: Utc::now(),
            events: vec![],
            status: None,
            tags: None,
            size_bytes: 0,
        }
    }

    fn row(project_id: Uuid, content: &str) -> CHDedupedContent {
        CHDedupedContent::new(project_id, [0u8; 32], content.to_string())
    }

    fn modes(project_id: Uuid, mode: Option<PiiMode>) -> HashMap<Uuid, Option<PiiMode>> {
        HashMap::from([(project_id, mode)])
    }

    #[tokio::test]
    async fn off_project_is_untouched_and_unchecked() {
        let p = Uuid::new_v4();
        let mut spans = vec![span(p, Some(json!("secret")), None)];
        let mut rows = vec![row(p, "\"secret\"")];
        let redactor = FakeRedactor::new(false);
        let outcome = redact_spans_in_place(
            &redactor,
            &mut spans,
            &mut rows,
            &mut [vec![]],
            &mut [vec![]],
            &[0],
            &modes(p, Some(PiiMode::Off)),
        )
        .await;
        assert!(redactor.calls.lock().unwrap().is_empty());
        assert_eq!(outcome.span(0).state, PiiState::Unchecked);
        assert_eq!(rows[0].pii_state, u8::from(PiiState::Unchecked));
        assert_eq!(spans[0].input, Some(json!("secret")));
    }

    #[tokio::test]
    async fn redact_mode_overwrites_raw_and_stamps_clean() {
        let p = Uuid::new_v4();
        let mut spans = vec![span(p, Some(json!("a secret")), Some(json!("plain")))];
        let mut rows = vec![row(p, "{\"content\":\"secret\"}")];
        let mut tn_in = [vec!["\"secret msg\"".to_string()]];
        let outcome = redact_spans_in_place(
            &FakeRedactor::new(false),
            &mut spans,
            &mut rows,
            &mut tn_in,
            &mut [vec![]],
            &[0],
            &modes(p, Some(PiiMode::Redact)),
        )
        .await;
        let verdict = outcome.span(0);
        assert_eq!(verdict.state, PiiState::Clean);
        assert_eq!(verdict.input_redacted, None);
        assert_eq!(spans[0].input, Some(json!("a [REDACTED_SECRET]")));
        assert_eq!(spans[0].output, Some(json!("plain")));
        assert_eq!(rows[0].content, "{\"content\":\"[REDACTED_SECRET]\"}");
        assert_eq!(rows[0].content_redacted, "");
        assert_eq!(rows[0].pii_state, u8::from(PiiState::Clean));
        assert_eq!(tn_in[0][0], "\"[REDACTED_SECRET] msg\"");
        assert!(outcome.is_indexable(0));
    }

    #[tokio::test]
    async fn dual_mode_keeps_raw_and_fills_sparse_copies() {
        let p = Uuid::new_v4();
        let mut spans = vec![
            span(p, Some(json!("a secret")), Some(json!("plain"))),
            span(p, Some(json!("nothing here")), None),
        ];
        let mut rows = vec![
            row(p, "{\"content\":\"secret\"}"),
            row(p, "{\"content\":\"ok\"}"),
        ];
        let mut tn_in = [vec!["\"secret msg\"".to_string()], vec![]];
        let outcome = redact_spans_in_place(
            &FakeRedactor::new(false),
            &mut spans,
            &mut rows,
            &mut tn_in,
            &mut [vec![], vec![]],
            &[0, 1],
            &modes(p, Some(PiiMode::Dual)),
        )
        .await;

        let hit = outcome.span(0);
        assert_eq!(hit.state, PiiState::Redacted);
        assert_eq!(
            hit.input_redacted.as_deref(),
            Some("\"a [REDACTED_SECRET]\"")
        );
        assert_eq!(hit.output_redacted, None);
        assert_eq!(spans[0].input, Some(json!("a secret")));

        let clean = outcome.span(1);
        assert_eq!(clean.state, PiiState::Clean);
        assert_eq!(clean.input_redacted, None);

        assert_eq!(rows[0].content, "{\"content\":\"secret\"}");
        assert_eq!(
            rows[0].content_redacted,
            "{\"content\":\"[REDACTED_SECRET]\"}"
        );
        assert_eq!(rows[0].pii_state, u8::from(PiiState::Redacted));
        assert_eq!(rows[1].content_redacted, "");
        assert_eq!(rows[1].pii_state, u8::from(PiiState::Clean));

        // Search buffers only ever carry redacted text.
        assert_eq!(tn_in[0][0], "\"[REDACTED_SECRET] msg\"");
        assert!(outcome.is_indexable(0));
    }

    #[tokio::test]
    async fn rpc_failure_stamps_failed_and_leaves_raw() {
        let p = Uuid::new_v4();
        let mut spans = vec![span(p, Some(json!("secret")), None)];
        let mut rows = vec![row(p, "\"secret\"")];
        let outcome = redact_spans_in_place(
            &FakeRedactor::new(true),
            &mut spans,
            &mut rows,
            &mut [vec![]],
            &mut [vec![]],
            &[0],
            &modes(p, Some(PiiMode::Dual)),
        )
        .await;
        assert_eq!(outcome.span(0).state, PiiState::Failed);
        assert_eq!(rows[0].pii_state, u8::from(PiiState::Failed));
        assert_eq!(spans[0].input, Some(json!("secret")));
        assert!(!outcome.is_indexable(0));
    }

    #[tokio::test]
    async fn failed_redact_mode_span_stays_indexable() {
        let p = Uuid::new_v4();
        let mut spans = vec![span(p, Some(json!("secret")), None)];
        let outcome = redact_spans_in_place(
            &FakeRedactor::new(true),
            &mut spans,
            &mut [],
            &mut [vec![]],
            &mut [vec![]],
            &[0],
            &modes(p, Some(PiiMode::Redact)),
        )
        .await;
        assert_eq!(outcome.span(0).state, PiiState::Failed);
        assert!(outcome.is_indexable(0));
    }

    #[tokio::test]
    async fn unknown_mode_is_failed_without_rpc() {
        let p = Uuid::new_v4();
        let mut spans = vec![span(p, Some(json!("secret")), None)];
        let mut rows = vec![row(p, "\"secret\"")];
        let redactor = FakeRedactor::new(false);
        let outcome = redact_spans_in_place(
            &redactor,
            &mut spans,
            &mut rows,
            &mut [vec![]],
            &mut [vec![]],
            &[0],
            &modes(p, None),
        )
        .await;
        assert!(redactor.calls.lock().unwrap().is_empty());
        assert_eq!(outcome.span(0).state, PiiState::Failed);
        assert_eq!(rows[0].pii_state, u8::from(PiiState::Failed));
    }

    #[test]
    fn combine_prefers_the_worst_state() {
        assert_eq!(
            combine(PiiState::Clean, PiiState::Redacted),
            PiiState::Redacted
        );
        assert_eq!(
            combine(PiiState::Redacted, PiiState::Failed),
            PiiState::Failed
        );
        assert_eq!(
            combine(PiiState::Unchecked, PiiState::Clean),
            PiiState::Clean
        );
        assert_eq!(
            combine(PiiState::Unchecked, PiiState::Unchecked),
            PiiState::Unchecked
        );
    }
}
