//! Stream-transport Quickwit indexer (LAM-2024).
//!
//! The queue path indexes one payload per delivery; here the reader accumulates
//! payloads first, so a flush can carry several. Documents are grouped by index
//! id and ingested per index — one Quickwit call per index per flush instead of
//! one per payload.

use std::collections::HashMap;
use std::time::Duration;

use async_trait::async_trait;

use crate::{
    mq::stream::StreamBatchHandler,
    quickwit::{
        FlattenJson, IndexerQueuePayload, PreprocessForIndexing, QuickwitDocument,
        client::QuickwitClient,
    },
    worker::HandlerError,
};

pub struct StreamQuickwitIndexerHandler {
    pub quickwit_client: QuickwitClient,
    pub batch_size: usize,
    pub flush_interval: Duration,
}

#[async_trait]
impl StreamBatchHandler for StreamQuickwitIndexerHandler {
    type Message = IndexerQueuePayload;

    fn interval(&self) -> Duration {
        self.flush_interval
    }

    fn batch_size(&self) -> usize {
        self.batch_size
    }

    async fn flush(&self, messages: &[Self::Message]) -> Result<(), HandlerError> {
        let mut by_index: HashMap<&'static str, Vec<QuickwitDocument>> = HashMap::new();
        for payload in messages {
            let index_id = payload.index_id();
            let mut docs = payload.clone().into_documents();
            docs.iter_mut().for_each(|doc| {
                doc.flatten_json();
                doc.preprocess_for_indexing();
            });
            by_index.entry(index_id).or_default().extend(docs);
        }

        // EVERY index is attempted, even after one fails. A flush mixes payloads
        // for different indices, and a `Permanent` failure makes the reader
        // dead-letter the whole batch and advance the offset — so returning early
        // would discard sibling payloads (e.g. spans) that a bad events payload
        // never gave a chance to ingest. Re-ingesting is safe: Quickwit is
        // idempotent per document id, so indices that already succeeded are
        // unaffected when a transient retry replays the batch.
        let mut transient: Option<HandlerError> = None;
        let mut permanent: Option<HandlerError> = None;

        for (index_id, docs) in by_index {
            if docs.is_empty() {
                continue;
            }
            if let Err(e) = self.quickwit_client.ingest(index_id, &docs).await {
                log::error!(
                    "Failed to ingest into Quickwit index {}: {}",
                    index_id,
                    e.message()
                );

                if e.status_code() == tonic::Code::Unavailable
                    || e.status_code() == tonic::Code::DeadlineExceeded
                {
                    if let Err(reconnect_err) = self.quickwit_client.reconnect().await {
                        log::error!("Failed to reconnect to Quickwit: {:?}", reconnect_err);
                    }
                }

                match e.to_handler_error() {
                    err @ HandlerError::Transient(_) => transient.get_or_insert(err),
                    err @ HandlerError::Permanent(_) => permanent.get_or_insert(err),
                };
            }
        }

        // Transient wins over permanent: it retries the batch in place without
        // advancing the offset, so a recoverable index failure never rides out on
        // an unrelated index's permanent error.
        match transient.or(permanent) {
            Some(err) => Err(err),
            None => Ok(()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Mirrors the precedence in `flush`: transient must win, so a recoverable
    /// index failure retries the batch in place instead of riding out on an
    /// unrelated index's permanent error (which would advance the offset and
    /// discard the sibling payloads).
    fn resolve(
        transient: Option<HandlerError>,
        permanent: Option<HandlerError>,
    ) -> Option<HandlerError> {
        transient.or(permanent)
    }

    #[test]
    fn transient_takes_precedence_over_permanent() {
        let resolved = resolve(
            Some(HandlerError::transient(anyhow::anyhow!("quickwit down"))),
            Some(HandlerError::permanent(anyhow::anyhow!("bad doc"))),
        );
        assert!(
            resolved.is_some_and(|e| e.should_requeue()),
            "a transient failure anywhere in the batch must retry, not drop"
        );
    }

    #[test]
    fn permanent_alone_does_not_requeue() {
        let resolved = resolve(
            None,
            Some(HandlerError::permanent(anyhow::anyhow!("bad doc"))),
        );
        assert!(resolved.is_some_and(|e| !e.should_requeue()));
    }

    #[test]
    fn all_indices_succeeding_yields_ok() {
        assert!(resolve(None, None).is_none());
    }
}
