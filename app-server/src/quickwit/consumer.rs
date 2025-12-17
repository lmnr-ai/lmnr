use async_trait::async_trait;

use crate::{
    quickwit::{FlattenJson, IndexerQueuePayload, client::QuickwitClient},
    worker::MessageHandler,
};

/// Handler for Quickwit span indexing
pub struct QuickwitIndexerHandler {
    pub quickwit_client: QuickwitClient,
}

#[async_trait]
impl MessageHandler for QuickwitIndexerHandler {
    type Message = IndexerQueuePayload;

    async fn handle(&self, payload: Self::Message) -> Result<(), crate::worker::HandlerError> {
        let index_id = payload.index_id();
        let mut docs = payload.into_documents();

        docs.iter_mut().for_each(|doc| doc.flatten_json());

        let result = self.quickwit_client.ingest(index_id, &docs).await;

        if let Err(e) = result {
            log::error!("Failed to ingest into Quickwit: {}", e.message());

            if e.status_code() == tonic::Code::Unavailable
                || e.status_code() == tonic::Code::DeadlineExceeded
            {
                if let Err(reconnect_err) = self.quickwit_client.reconnect().await {
                    log::error!("Failed to reconnect to Quickwit: {:?}", reconnect_err);
                }
            }

            Err(e.to_handler_error())
        } else {
            Ok(())
        }
    }
}
