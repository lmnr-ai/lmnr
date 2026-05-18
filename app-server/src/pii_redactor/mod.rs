use std::sync::Arc;

use anyhow::{Result, anyhow};
use tonic::transport::Channel;

use crate::db::spans::Span;
use crate::traces::input_dedup::DedupBatch;
use crate::utils::sanitize_string;

#[allow(clippy::all)]
pub mod pii_redactor;

use pii_redactor::{
    RedactRequest, pii_redactor_service_client::PiiRedactorServiceClient,
};

/// Span attribute that opts a single span in to PII redaction.
pub const SHOULD_REMOVE_PII_ATTR: &str = "lmnr.should_remove_pii";

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
    /// Whole `span.input` (non-LLM PII span).
    Input(usize),
    /// Whole `span.output`.
    Output(usize),
    /// One newly-deduped LLM input message: positions inside both the span's
    /// `input` array AND `dedup.messages`. We must update both so Quickwit
    /// indexing (which projects `span_new_indices` back onto `span.input`)
    /// and the `llm_messages` insert (which uses `dedup.messages[k].content`)
    /// see the same redacted bytes.
    LlmNewMessage {
        span_idx: usize,
        item_idx: usize,
        dedup_msg_idx: usize,
    },
}

/// Redact `span.input` / `span.output` for spans whose attributes carry
/// `lmnr.should_remove_pii = true`. For LLM spans the redaction targets only
/// the **newly-deduped** input messages (those about to be inserted into
/// `llm_messages`), avoiding paying redaction compute for messages that were
/// already seen earlier in the trace. Both fields per span are sent in the
/// same RPC so the caller pays one round-trip for the whole batch.
///
/// MUST run after `build_dedup_batch` and BEFORE the `llm_messages`
/// ClickHouse insert, so the dedup'd content reaching CH (and the span input
/// projected into Quickwit via `span_new_indices`) is the redacted version.
///
/// Best-effort: any RPC failure is logged and the spans are left untouched —
/// PII redaction must never block trace ingestion.
pub async fn redact_spans_in_place(
    client: &PiiRedactorClient,
    spans: &mut [Span],
    dedup: &mut DedupBatch,
    recordable_indices: &[usize],
) {
    let mut targets: Vec<Target> = Vec::new();
    let mut texts: Vec<String> = Vec::new();

    // `dedup.span_new_indices[dedup_idx]` holds the positions inside the LLM
    // span's `input` array that this span was first to introduce. They are
    // pushed in the same order as `dedup.messages` (within this span's slice
    // of it), so we can walk them in lockstep with the messages cursor.
    let mut dedup_msg_cursor: usize = 0;

    for (dedup_idx, &span_idx) in recordable_indices.iter().enumerate() {
        let span = &spans[span_idx];
        let opted_in = span.attributes.bool_attr(SHOULD_REMOVE_PII_ATTR) == Some(true);
        let new_indices = dedup
            .span_new_indices
            .get(dedup_idx)
            .map(|v| v.as_slice())
            .unwrap_or(&[]);
        // `span_hashes[i]` is non-empty iff dedup actually replaced this
        // span's input with hashes. In that case `ch_span.input` is forced
        // to empty downstream and Quickwit only sees `new_indices` — so
        // redacting the whole `span.input` would be wasted work; only the
        // new-message slice is worth processing.
        let is_dedup_llm = dedup
            .span_hashes
            .get(dedup_idx)
            .is_some_and(|h| !h.is_empty());

        if opted_in {
            if is_dedup_llm {
                // Dedup'd LLM span: redact only the newly-introduced messages.
                if let Some(serde_json::Value::Array(items)) = span.input.as_ref() {
                    for (offset, &i) in new_indices.iter().enumerate() {
                        let item_idx = i as usize;
                        let Some(item) = items.get(item_idx) else {
                            continue;
                        };
                        match serde_json::to_string(item) {
                            Ok(s) => {
                                targets.push(Target::LlmNewMessage {
                                    span_idx,
                                    item_idx,
                                    dedup_msg_idx: dedup_msg_cursor + offset,
                                });
                                texts.push(s);
                            }
                            Err(e) => log::warn!(
                                "pii-redactor: serialize span[{span_idx}].input[{item_idx}]: {e:#}"
                            ),
                        }
                    }
                }
            } else if let Some(input) = span.input.as_ref() {
                // Non-LLM (or LLM with non-array input): redact the whole input.
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

        dedup_msg_cursor += new_indices.len();
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
            Target::LlmNewMessage {
                span_idx,
                item_idx,
                dedup_msg_idx,
            } => {
                let parsed: serde_json::Value = match serde_json::from_str(&text) {
                    Ok(v) => v,
                    Err(e) => {
                        log::warn!(
                            "pii-redactor: parse redacted span[{span_idx}].input[{item_idx}]: {e:#}"
                        );
                        continue;
                    }
                };
                // Mirror update: the span's input array (read by Quickwit
                // indexing via `span_new_indices`) AND the dedup batch's
                // CH row content (pre-insert, hash-keyed). Both must reflect
                // the redacted bytes — a divergence would surface unredacted
                // content in either search snippets or `llm_messages`.
                if let Some(serde_json::Value::Array(items)) =
                    spans[span_idx].input.as_mut()
                    && let Some(slot) = items.get_mut(item_idx)
                {
                    *slot = parsed.clone();
                }
                if let Some(msg) = dedup.messages.get_mut(dedup_msg_idx) {
                    msg.content = sanitize_string(&parsed.to_string());
                }
            }
        }
    }
}
