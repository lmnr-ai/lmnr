use std::sync::Arc;

use anyhow::{Result, anyhow};
use tonic::transport::Channel;

use crate::db::spans::Span;

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

/// In-place redact `span.input` and `span.output` for spans whose attributes
/// carry `lmnr.should_remove_pii = true`. Both fields per span are sent in the
/// same RPC so the caller pays one round-trip for the whole batch.
///
/// Best-effort: any RPC failure is logged and the spans are left untouched —
/// PII redaction must never block trace ingestion.
pub async fn redact_spans_in_place(client: &PiiRedactorClient, spans: &mut [Span]) {
    // (span_idx, field) pairs we plan to send. `field` is `0` for input,
    // `1` for output, so the round-trip back can write to the right slot.
    let mut targets: Vec<(usize, u8)> = Vec::new();
    let mut texts: Vec<String> = Vec::new();

    for (i, span) in spans.iter().enumerate() {
        if span.attributes.bool_attr(SHOULD_REMOVE_PII_ATTR) != Some(true) {
            continue;
        }
        if let Some(input) = span.input.as_ref() {
            match serde_json::to_string(input) {
                Ok(s) => {
                    targets.push((i, 0));
                    texts.push(s);
                }
                Err(e) => log::warn!("pii-redactor: serialize span[{i}].input: {e:#}"),
            }
        }
        if let Some(output) = span.output.as_ref() {
            match serde_json::to_string(output) {
                Ok(s) => {
                    targets.push((i, 1));
                    texts.push(s);
                }
                Err(e) => log::warn!("pii-redactor: serialize span[{i}].output: {e:#}"),
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

    for ((idx, field), text) in targets.into_iter().zip(redacted.into_iter()) {
        let parsed: serde_json::Value = match serde_json::from_str(&text) {
            Ok(v) => v,
            Err(e) => {
                log::warn!("pii-redactor: parse redacted span[{idx}] field[{field}]: {e:#}");
                continue;
            }
        };
        match field {
            0 => spans[idx].input = Some(parsed),
            1 => spans[idx].output = Some(parsed),
            _ => unreachable!(),
        }
    }
}
