use std::sync::Arc;

use anyhow::anyhow;
use backoff::ExponentialBackoffBuilder;
use serde_json;
use tokio::time::Duration;

use crate::{
    mq::{MessageQueue, MessageQueueDeliveryTrait, MessageQueueReceiverTrait, MessageQueueTrait},
    quickwit::{
        QuickwitIndexedSpan, SPANS_INDEXER_EXCHANGE, SPANS_INDEXER_QUEUE,
        SPANS_INDEXER_ROUTING_KEY, client::QuickwitClient,
    },
};

pub async fn process_queue_spans_indexer(
    queue: Arc<MessageQueue>,
    quickwit_client: QuickwitClient,
) {
    loop {
        if let Err(e) =
            inner_process_spans_indexer_queue(queue.clone(), quickwit_client.clone()).await
        {
            log::error!(
                "Quickwit spans indexer worker exited with error: {:?}. Restarting....",
                e
            );
        } else {
            log::warn!("Quickwit spans indexer worker exited gracefully. Restarting...");
        }
    }
}

async fn inner_process_spans_indexer_queue(
    queue: Arc<MessageQueue>,
    quickwit_client: QuickwitClient,
) -> anyhow::Result<()> {
    let get_receiver = || async {
        queue
            .get_receiver(
                SPANS_INDEXER_QUEUE,
                SPANS_INDEXER_EXCHANGE,
                SPANS_INDEXER_ROUTING_KEY,
            )
            .await
            .map_err(|e| {
                log::error!(
                    "Failed to get receiver for Quickwit spans indexer queue: {:?}",
                    e
                );
                backoff::Error::transient(e)
            })
    };

    let backoff = ExponentialBackoffBuilder::new()
        .with_initial_interval(Duration::from_secs(1))
        .with_max_interval(Duration::from_secs(60))
        .with_max_elapsed_time(Some(Duration::from_secs(300)))
        .build();

    let mut receiver = match backoff::future::retry(backoff, get_receiver).await {
        Ok(receiver) => {
            log::info!("Connected to Quickwit spans indexer queue");
            receiver
        }
        Err(e) => {
            log::error!(
                "Failed to connect to Quickwit spans indexer queue after retries: {:?}",
                e
            );
            return Err(anyhow!("Could not bind to Quickwit spans indexer queue"));
        }
    };

    log::info!(
        "Quickwit spans indexer worker started (endpoint={})",
        quickwit_client.endpoint(),
    );

    while let Some(delivery) = receiver.receive().await {
        let delivery = match delivery {
            Ok(delivery) => delivery,
            Err(e) => {
                log::error!(
                    "Failed to receive message from Quickwit spans indexer queue: {:?}",
                    e
                );
                continue;
            }
        };

        let acker = delivery.acker();
        let payload = delivery.data();

        let indexed_spans: Vec<QuickwitIndexedSpan> = match serde_json::from_slice(&payload) {
            Ok(spans) => spans,
            Err(e) => {
                log::error!(
                    "Failed to deserialize Quickwit span payload ({} bytes): {:?}",
                    payload.len(),
                    e
                );
                let _ = acker.reject(false).await.map_err(|err| {
                    log::error!(
                        "Failed to reject malformed Quickwit indexing message: {:?}",
                        err
                    );
                });
                continue;
            }
        };

        if indexed_spans.is_empty() {
            if let Err(e) = acker.ack().await {
                log::error!(
                    "Failed to ack empty Quickwit indexing batch delivery: {:?}",
                    e
                );
            }
            continue;
        }

        match quickwit_client.ingest("spans", &indexed_spans).await {
            Ok(_) => {
                if let Err(e) = acker.ack().await {
                    log::error!(
                        "Failed to ack Quickwit indexing delivery after ingest success: {:?}",
                        e
                    );
                }
            }
            Err(e) => {
                log::error!(
                    "Failed to ingest {} spans into Quickwit: {:?}",
                    indexed_spans.len(),
                    e
                );

                let _ = acker.reject(true).await.map_err(|reject_err| {
                    log::error!(
                        "Failed to reject Quickwit indexing delivery after ingest failure: {:?}",
                        reject_err
                    );
                });

                quickwit_client.reconnect().await?;
            }
        }
    }

    log::warn!("Quickwit spans indexer queue closed connection");
    Ok(())
}
