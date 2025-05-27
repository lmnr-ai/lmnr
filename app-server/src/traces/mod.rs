use std::sync::Arc;

use uuid::Uuid;

use crate::{
    cache::Cache,
    ch::{self, spans::CHSpan},
    db::{
        DB,
        events::Event,
        spans::Span,
        stats::{add_spans_to_project_usage_stats, increment_project_data_ingested},
    },
    mq::MessageQueueAcker,
    traces::{
        events::record_events,
        utils::{get_llm_usage_for_span, record_labels_to_db_and_ch, record_span_to_db},
    },
    utils::estimate_json_size,
};

pub mod attributes;
pub mod consumer;
pub mod events;
pub mod grpc_service;
pub mod limits;

pub mod producer;
pub mod span_attributes;
pub mod spans;
pub mod utils;

pub const OBSERVATIONS_QUEUE: &str = "observations_queue";
pub const OBSERVATIONS_EXCHANGE: &str = "observations_exchange";
pub const OBSERVATIONS_ROUTING_KEY: &str = "observations_routing_key";

pub async fn process_spans_and_events(
    span: &mut Span,
    events: Vec<Event>,
    project_id: &Uuid,
    db: Arc<DB>,
    clickhouse: clickhouse::Client,
    cache: Arc<Cache>,
    acker: MessageQueueAcker,
) {
    let span_usage =
        get_llm_usage_for_span(&mut span.get_attributes(), db.clone(), cache.clone()).await;

    let recorded_span_bytes =
        match record_span_to_db(db.clone(), &span_usage, &project_id, span, &events).await {
            Ok(_) => {
                let _ = acker.ack().await.map_err(|e| {
                    log::error!("Failed to ack MQ delivery (span): {:?}", e);
                });
                estimate_json_size(
                    &serde_json::to_value(&span.get_attributes().attributes).unwrap_or_default(),
                )
            }
            Err(e) => {
                log::error!(
                    "Failed to record span. span_id [{}], project_id [{}]: {:?}",
                    span.span_id,
                    project_id,
                    e
                );
                // TODO: Implement proper nacks and DLX
                let _ = acker.reject(false).await.map_err(|e| {
                    log::error!("Failed to reject MQ delivery (span): {:?}", e);
                });
                0
            }
        };

    if let Err(e) = add_spans_to_project_usage_stats(&db.pool, &project_id, 1).await {
        log::error!(
            "Failed to add spans and events to project usage stats: {:?}",
            e
        );
    }

    let recorded_events_bytes = match record_events(db.clone(), clickhouse.clone(), &events).await {
        Ok(_) => estimate_json_size(&serde_json::to_value(&events).unwrap_or_default()),
        Err(e) => {
            log::error!("Failed to record events: {:?}", e);
            0
        }
    };

    if let Err(e) = increment_project_data_ingested(
        &db.pool,
        &project_id,
        recorded_span_bytes + recorded_events_bytes,
    )
    .await
    {
        log::error!("Failed to increment project data ingested: {:?}", e);
    }

    if let Err(e) =
        record_labels_to_db_and_ch(db.clone(), clickhouse.clone(), &span, &project_id).await
    {
        log::error!(
            "Failed to record labels to DB. span_id [{}], project_id [{}]: {:?}",
            span.span_id,
            project_id,
            e
        );
    }

    let ch_span = CHSpan::from_db_span(span, span_usage, *project_id);

    if let Err(e) = ch::spans::insert_span(clickhouse.clone(), &ch_span).await {
        log::error!(
            "Failed to insert span into Clickhouse. span_id [{}], project_id [{}]: {:?}",
            span.span_id,
            project_id,
            e
        );
    }
}
