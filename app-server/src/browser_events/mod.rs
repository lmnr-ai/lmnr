use std::sync::Arc;

use uuid::Uuid;

use crate::{
    api::v1::browser_sessions::{
        BROWSER_SESSIONS_EXCHANGE, BROWSER_SESSIONS_QUEUE, BROWSER_SESSIONS_ROUTING_KEY,
    },
    mq,
};

pub async fn process_browser_events(
    clickhouse: clickhouse::Client,
    browser_events_message_queue: Arc<
        dyn mq::MessageQueue<crate::api::v1::browser_sessions::QueueBrowserEventMessage>,
    >,
) {
    loop {
        inner_process_browser_events(clickhouse.clone(), browser_events_message_queue.clone())
            .await;
    }
}

async fn inner_process_browser_events(
    clickhouse: clickhouse::Client,
    queue: Arc<dyn mq::MessageQueue<crate::api::v1::browser_sessions::QueueBrowserEventMessage>>,
) {
    let mut receiver = queue
        .get_receiver(
            BROWSER_SESSIONS_QUEUE,
            BROWSER_SESSIONS_EXCHANGE,
            BROWSER_SESSIONS_ROUTING_KEY,
        )
        .await
        .unwrap();

    while let Some(delivery) = receiver.receive().await {
        if let Err(e) = delivery {
            log::error!("Failed to receive message from queue: {:?}", e);
            continue;
        }
        let delivery = delivery.unwrap();
        let message = delivery.data();
        let project_id = message.project_id;
        let batch = message.batch;

        if batch.events.is_empty() {
            continue;
        }

        // We could further tune async_insert by setting
        //  - `async_insert_max_data_size` (bytes)
        //  - `async_insert_busy_timeout_ms`
        // These are defaulted globally to 10MiB and 1000ms respectively.
        // More: https://clickhouse.com/docs/en/optimize/asynchronous-inserts
        let mut query = String::from(
            "
        INSERT INTO browser_session_events (
            event_id, session_id, trace_id, timestamp,
            event_type, data, project_id
        )
        SETTINGS async_insert = 1,
            wait_for_async_insert = 1
        VALUES ",
        );

        let mut values = Vec::new();

        for (i, event) in batch.events.iter().enumerate() {
            if i > 0 {
                query.push_str(", ");
            }
            query.push_str("(?, ?, ?, ?, ?, ?, ?)");

            // Add each value individually
            values.extend_from_slice(&[
                Uuid::new_v4().to_string(),
                batch.session_id.to_string(),
                batch.trace_id.to_string(),
                event.timestamp.to_string(),
                event.event_type.to_string(),
                event.data.to_string(),
                project_id.to_string(),
            ]);
        }

        // Execute batch insert with individual bindings
        // let mut query_with_bindings = clickhouse.query(&query);
        // for value in values {
        //     query_with_bindings = query_with_bindings.bind(value);
        // }
        // if let Err(e) = query_with_bindings.execute().await {
        //     log::error!("Failed to insert browser events: {:?}", e);
        // }

        if let Err(e) = delivery.ack().await {
            log::error!("Failed to ack message: {:?}", e);
        }
    }
}
