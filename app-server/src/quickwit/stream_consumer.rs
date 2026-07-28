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

        // First failure aborts the flush so the whole batch is retried in place.
        // Indexing is idempotent per document id, so re-ingesting an index that
        // already succeeded is harmless.
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

                return Err(e.to_handler_error());
            }
        }

        Ok(())
    }
}
