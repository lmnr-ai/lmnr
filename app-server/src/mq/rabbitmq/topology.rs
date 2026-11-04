//! The exchanges, queues and bindings app-server relies on. Declared on every
//! new publisher connection (`connection.rs`), so a broker that lost its
//! definitions gets them back on reconnect, not only at boot.
//!
//! The origin queues are NOT bound here: `get_receiver` binds each one to its
//! exchange when a consumer subscribes. Only the consumer-less park/retry/delay
//! queues are bound at declare time.

use futures_util::future::BoxFuture;
use lapin::{
    Channel, ExchangeKind,
    options::{ExchangeDeclareOptions, QueueDeclareOptions},
    types::FieldTable,
};

use crate::{
    api::v1::browser_sessions::{BROWSER_SESSIONS_EXCHANGE, BROWSER_SESSIONS_QUEUE},
    audit::{AUDIT_EXCHANGE, AUDIT_QUEUE},
    logs::{LOGS_EXCHANGE, LOGS_QUEUE},
    notifications::{
        NOTIFICATIONS_EXCHANGE, NOTIFICATIONS_QUEUE,
        delivery::{NOTIFICATION_DELIVERIES_EXCHANGE, NOTIFICATION_DELIVERIES_QUEUE},
    },
    quickwit::{SPANS_INDEXER_EXCHANGE, SPANS_INDEXER_QUEUE},
    reports::{REPORT_TRIGGERS_EXCHANGE, REPORT_TRIGGERS_QUEUE},
    traces::{
        OBSERVATIONS_EXCHANGE, OBSERVATIONS_QUEUE, SPANS_DATA_PLANE_EXCHANGE,
        SPANS_DATA_PLANE_QUEUE,
        input_extraction::{
            queue::{INPUT_EXTRACTION_EXCHANGE, INPUT_EXTRACTION_QUEUE},
            regex_agent::{USER_TASK_REGEX_EXCHANGE, USER_TASK_REGEX_QUEUE},
        },
        sp_versioning::VersionKind,
        static_sp_extraction::{
            STATIC_PROMPT_EXCHANGE, STATIC_PROMPT_QUEUE,
            worker::{SP_REGEX_EXTRACTION_EXCHANGE, SP_REGEX_EXTRACTION_QUEUE},
        },
    },
};
#[cfg(feature = "signals")]
use crate::{
    clustering::private::{
        EVENT_CLUSTERING_BATCH_EXCHANGE, EVENT_CLUSTERING_BATCH_QUEUE, EVENT_CLUSTERING_EXCHANGE,
        EVENT_CLUSTERING_QUEUE,
    },
    signals::private::queue::{
        SIGNALS_ADMISSION_EXCHANGE, SIGNALS_ADMISSION_QUEUE, SIGNALS_ADMISSION_RETRY_EXCHANGE,
        SIGNALS_ADMISSION_RETRY_QUEUE, SIGNALS_ADMISSION_RETRY_ROUTING_KEY,
        SIGNALS_ADMISSION_ROUTING_KEY, SIGNALS_ADMISSION_WAITING_EXCHANGE,
        SIGNALS_ADMISSION_WAITING_QUEUE, SIGNALS_ADMISSION_WAITING_ROUTING_KEY,
        SIGNALS_BACKFILL_EXCHANGE, SIGNALS_BACKFILL_QUEUE, SIGNALS_BACKFILL_RETRY_EXCHANGE,
        SIGNALS_BACKFILL_RETRY_QUEUE, SIGNALS_BACKFILL_RETRY_ROUTING_KEY,
        SIGNALS_BACKFILL_ROUTING_KEY, SIGNALS_BACKFILL_WAITING_EXCHANGE,
        SIGNALS_BACKFILL_WAITING_QUEUE, SIGNALS_BACKFILL_WAITING_ROUTING_KEY,
        SIGNALS_REALTIME_EXCHANGE, SIGNALS_REALTIME_QUEUE, SIGNALS_REALTIME_RETRY_EXCHANGE,
        SIGNALS_REALTIME_RETRY_QUEUE, SIGNALS_REALTIME_RETRY_ROUTING_KEY,
        SIGNALS_REALTIME_ROUTING_KEY, SIGNALS_REALTIME_WAITING_EXCHANGE,
        SIGNALS_REALTIME_WAITING_QUEUE, SIGNALS_REALTIME_WAITING_ROUTING_KEY,
    },
};

pub fn declare_topology(channel: &Channel) -> BoxFuture<'_, anyhow::Result<()>> {
    Box::pin(async move {
        // Create quorum queue arguments (reused for all queues)
        let mut quorum_queue_args = FieldTable::default();
        quorum_queue_args.insert(
            "x-queue-type".into(),
            lapin::types::AMQPValue::LongString("quorum".into()),
        );

        // Register queues
        // ==== 3.1 Spans message queue ====
        channel
            .exchange_declare(
                OBSERVATIONS_EXCHANGE.into(),
                ExchangeKind::Fanout,
                ExchangeDeclareOptions {
                    durable: true,
                    ..Default::default()
                },
                FieldTable::default(),
            )
            .await?;

        channel
            .queue_declare(
                OBSERVATIONS_QUEUE.into(),
                QueueDeclareOptions {
                    durable: true,
                    ..Default::default()
                },
                quorum_queue_args.clone(),
            )
            .await?;

        // ==== 3.1a Spans data plane message queue ====
        channel
            .exchange_declare(
                SPANS_DATA_PLANE_EXCHANGE.into(),
                ExchangeKind::Fanout,
                ExchangeDeclareOptions {
                    durable: true,
                    ..Default::default()
                },
                FieldTable::default(),
            )
            .await?;

        channel
            .queue_declare(
                SPANS_DATA_PLANE_QUEUE.into(),
                QueueDeclareOptions {
                    durable: true,
                    ..Default::default()
                },
                quorum_queue_args.clone(),
            )
            .await?;

        // ==== 3.1b Spans indexer message queue ====
        channel
            .exchange_declare(
                SPANS_INDEXER_EXCHANGE.into(),
                ExchangeKind::Fanout,
                ExchangeDeclareOptions {
                    durable: true,
                    ..Default::default()
                },
                FieldTable::default(),
            )
            .await?;

        channel
            .queue_declare(
                SPANS_INDEXER_QUEUE.into(),
                QueueDeclareOptions {
                    durable: true,
                    ..Default::default()
                },
                quorum_queue_args.clone(),
            )
            .await?;

        // ==== 3.2 Browser events message queue ====
        channel
            .exchange_declare(
                BROWSER_SESSIONS_EXCHANGE.into(),
                ExchangeKind::Fanout,
                ExchangeDeclareOptions {
                    durable: true,
                    ..Default::default()
                },
                FieldTable::default(),
            )
            .await?;

        channel
            .queue_declare(
                BROWSER_SESSIONS_QUEUE.into(),
                QueueDeclareOptions {
                    durable: true,
                    ..Default::default()
                },
                quorum_queue_args.clone(),
            )
            .await?;

        // ==== 3.2a Audit events message queue ====
        channel
            .exchange_declare(
                AUDIT_EXCHANGE.into(),
                ExchangeKind::Fanout,
                ExchangeDeclareOptions {
                    durable: true,
                    ..Default::default()
                },
                FieldTable::default(),
            )
            .await?;

        channel
            .queue_declare(
                AUDIT_QUEUE.into(),
                QueueDeclareOptions {
                    durable: true,
                    ..Default::default()
                },
                quorum_queue_args.clone(),
            )
            .await?;

        // ==== 3.5b Input extraction message queue ====
        channel
            .exchange_declare(
                INPUT_EXTRACTION_EXCHANGE.into(),
                ExchangeKind::Fanout,
                ExchangeDeclareOptions {
                    durable: true,
                    ..Default::default()
                },
                FieldTable::default(),
            )
            .await?;

        channel
            .queue_declare(
                INPUT_EXTRACTION_QUEUE.into(),
                QueueDeclareOptions {
                    durable: true,
                    ..Default::default()
                },
                quorum_queue_args.clone(),
            )
            .await?;

        // ==== 3.5c User-task regex agent queue ====
        // Separate from the extraction queue: an agent run takes minutes
        // while a per-trace extraction takes seconds. Failures drop and the
        // cohort accumulator's retry interval spaces the next attempt, so
        // there is no delay/retry topology.
        channel
            .exchange_declare(
                USER_TASK_REGEX_EXCHANGE.into(),
                ExchangeKind::Fanout,
                ExchangeDeclareOptions {
                    durable: true,
                    ..Default::default()
                },
                FieldTable::default(),
            )
            .await?;

        channel
            .queue_declare(
                USER_TASK_REGEX_QUEUE.into(),
                QueueDeclareOptions {
                    durable: true,
                    ..Default::default()
                },
                quorum_queue_args.clone(),
            )
            .await?;

        // ==== 3.6 Notifications message queue ====
        channel
            .exchange_declare(
                NOTIFICATIONS_EXCHANGE.into(),
                ExchangeKind::Fanout,
                ExchangeDeclareOptions {
                    durable: true,
                    ..Default::default()
                },
                FieldTable::default(),
            )
            .await?;

        channel
            .queue_declare(
                NOTIFICATIONS_QUEUE.into(),
                QueueDeclareOptions {
                    durable: true,
                    ..Default::default()
                },
                quorum_queue_args.clone(),
            )
            .await?;

        // ==== 3.6b Notification Deliveries message queue ====
        channel
            .exchange_declare(
                NOTIFICATION_DELIVERIES_EXCHANGE.into(),
                ExchangeKind::Fanout,
                ExchangeDeclareOptions {
                    durable: true,
                    ..Default::default()
                },
                FieldTable::default(),
            )
            .await?;

        channel
            .queue_declare(
                NOTIFICATION_DELIVERIES_QUEUE.into(),
                QueueDeclareOptions {
                    durable: true,
                    ..Default::default()
                },
                quorum_queue_args.clone(),
            )
            .await?;

        // ==== 3.7 Event Clustering message queue ====
        #[cfg(feature = "signals")]
        {
            channel
                .exchange_declare(
                    EVENT_CLUSTERING_EXCHANGE.into(),
                    ExchangeKind::Fanout,
                    ExchangeDeclareOptions {
                        durable: true,
                        ..Default::default()
                    },
                    FieldTable::default(),
                )
                .await?;

            channel
                .queue_declare(
                    EVENT_CLUSTERING_QUEUE.into(),
                    QueueDeclareOptions {
                        durable: true,
                        ..Default::default()
                    },
                    quorum_queue_args.clone(),
                )
                .await?;

            // ==== 3.7b Event Clustering Batch message queue ====
            channel
                .exchange_declare(
                    EVENT_CLUSTERING_BATCH_EXCHANGE.into(),
                    ExchangeKind::Fanout,
                    ExchangeDeclareOptions {
                        durable: true,
                        ..Default::default()
                    },
                    FieldTable::default(),
                )
                .await?;

            channel
                .queue_declare(
                    EVENT_CLUSTERING_BATCH_QUEUE.into(),
                    QueueDeclareOptions {
                        durable: true,
                        ..Default::default()
                    },
                    quorum_queue_args.clone(),
                )
                .await?;
        }

        // ==== 3.8 Signals agent message queues (realtime + backfill) ====
        #[cfg(feature = "signals")]
        {
            // The agent's two lanes, declared identically: realtime for
            // trigger runs, backfill for job runs, so a large backfill
            // scales on its own workers and never queues realtime traffic
            // behind it.
            for (
                exchange,
                queue,
                routing_key,
                waiting_exchange,
                waiting_queue,
                waiting_routing_key,
                retry_exchange,
                retry_queue,
                retry_routing_key,
            ) in [
                (
                    SIGNALS_REALTIME_EXCHANGE,
                    SIGNALS_REALTIME_QUEUE,
                    SIGNALS_REALTIME_ROUTING_KEY,
                    SIGNALS_REALTIME_WAITING_EXCHANGE,
                    SIGNALS_REALTIME_WAITING_QUEUE,
                    SIGNALS_REALTIME_WAITING_ROUTING_KEY,
                    SIGNALS_REALTIME_RETRY_EXCHANGE,
                    SIGNALS_REALTIME_RETRY_QUEUE,
                    SIGNALS_REALTIME_RETRY_ROUTING_KEY,
                ),
                (
                    SIGNALS_BACKFILL_EXCHANGE,
                    SIGNALS_BACKFILL_QUEUE,
                    SIGNALS_BACKFILL_ROUTING_KEY,
                    SIGNALS_BACKFILL_WAITING_EXCHANGE,
                    SIGNALS_BACKFILL_WAITING_QUEUE,
                    SIGNALS_BACKFILL_WAITING_ROUTING_KEY,
                    SIGNALS_BACKFILL_RETRY_EXCHANGE,
                    SIGNALS_BACKFILL_RETRY_QUEUE,
                    SIGNALS_BACKFILL_RETRY_ROUTING_KEY,
                ),
            ] {
                channel
                    .exchange_declare(
                        exchange.into(),
                        ExchangeKind::Fanout,
                        ExchangeDeclareOptions {
                            durable: true,
                            ..Default::default()
                        },
                        FieldTable::default(),
                    )
                    .await?;

                channel
                    .queue_declare(
                        queue.into(),
                        QueueDeclareOptions {
                            durable: true,
                            ..Default::default()
                        },
                        quorum_queue_args.clone(),
                    )
                    .await?;

                // Parking lot for runs waiting on a sibling to warm the
                // trace's prefix cache. No consumer — messages expire via
                // their per-message TTL and dead-letter back into the lane's
                // exchange. (The lane's queue itself is bound to that
                // exchange by `get_receiver` when a consumer subscribes.)
                channel
                    .exchange_declare(
                        waiting_exchange.into(),
                        ExchangeKind::Fanout,
                        ExchangeDeclareOptions {
                            durable: true,
                            ..Default::default()
                        },
                        FieldTable::default(),
                    )
                    .await?;

                let mut waiting_args = quorum_queue_args.clone();
                waiting_args.insert(
                    "x-dead-letter-exchange".into(),
                    lapin::types::AMQPValue::LongString(exchange.into()),
                );

                channel
                    .queue_declare(
                        waiting_queue.into(),
                        QueueDeclareOptions {
                            durable: true,
                            ..Default::default()
                        },
                        waiting_args,
                    )
                    .await?;

                channel
                    .queue_bind(
                        waiting_queue.into(),
                        waiting_exchange.into(),
                        waiting_routing_key.into(),
                        lapin::options::QueueBindOptions::default(),
                        FieldTable::default(),
                    )
                    .await?;

                // Holding pen for transiently-failed steps. Same shape as
                // the waiting queue above — no consumer, messages
                // dead-letter back into the lane's exchange once their TTL
                // expires — but separate so the retry delay and the park
                // delay stay independent knobs.
                channel
                    .exchange_declare(
                        retry_exchange.into(),
                        ExchangeKind::Fanout,
                        ExchangeDeclareOptions {
                            durable: true,
                            ..Default::default()
                        },
                        FieldTable::default(),
                    )
                    .await?;

                let mut retry_args = quorum_queue_args.clone();
                retry_args.insert(
                    "x-dead-letter-exchange".into(),
                    lapin::types::AMQPValue::LongString(exchange.into()),
                );
                // The target is a fanout exchange, which ignores routing
                // keys — set explicitly so the return path doesn't silently
                // depend on that if the exchange kind ever changes.
                retry_args.insert(
                    "x-dead-letter-routing-key".into(),
                    lapin::types::AMQPValue::LongString(routing_key.into()),
                );

                channel
                    .queue_declare(
                        retry_queue.into(),
                        QueueDeclareOptions {
                            durable: true,
                            ..Default::default()
                        },
                        retry_args,
                    )
                    .await?;

                channel
                    .queue_bind(
                        retry_queue.into(),
                        retry_exchange.into(),
                        retry_routing_key.into(),
                        lapin::options::QueueBindOptions::default(),
                        FieldTable::default(),
                    )
                    .await?;
            }

            // Admission gate in front of the realtime queue: claim, settle
            // and filter trigger-based runs, then publish the survivors on.
            // Same three-queue shape as the agent lanes (main + park +
            // retry), because the gate parks and retries for its own
            // reasons and must not push that churn onto the agent's queue.
            channel
                .exchange_declare(
                    SIGNALS_ADMISSION_EXCHANGE.into(),
                    ExchangeKind::Fanout,
                    ExchangeDeclareOptions {
                        durable: true,
                        ..Default::default()
                    },
                    FieldTable::default(),
                )
                .await?;

            channel
                .queue_declare(
                    SIGNALS_ADMISSION_QUEUE.into(),
                    QueueDeclareOptions {
                        durable: true,
                        ..Default::default()
                    },
                    quorum_queue_args.clone(),
                )
                .await?;

            // Parking lot for runs waiting on their trace to settle. No
            // consumer — messages expire via their per-message TTL and
            // dead-letter back into the admission exchange. (The admission
            // queue itself is bound to that exchange by `get_receiver` when
            // a consumer subscribes.)
            channel
                .exchange_declare(
                    SIGNALS_ADMISSION_WAITING_EXCHANGE.into(),
                    ExchangeKind::Fanout,
                    ExchangeDeclareOptions {
                        durable: true,
                        ..Default::default()
                    },
                    FieldTable::default(),
                )
                .await?;

            let mut admission_waiting_args = quorum_queue_args.clone();
            admission_waiting_args.insert(
                "x-dead-letter-exchange".into(),
                lapin::types::AMQPValue::LongString(SIGNALS_ADMISSION_EXCHANGE.into()),
            );

            channel
                .queue_declare(
                    SIGNALS_ADMISSION_WAITING_QUEUE.into(),
                    QueueDeclareOptions {
                        durable: true,
                        ..Default::default()
                    },
                    admission_waiting_args,
                )
                .await?;

            channel
                .queue_bind(
                    SIGNALS_ADMISSION_WAITING_QUEUE.into(),
                    SIGNALS_ADMISSION_WAITING_EXCHANGE.into(),
                    SIGNALS_ADMISSION_WAITING_ROUTING_KEY.into(),
                    lapin::options::QueueBindOptions::default(),
                    FieldTable::default(),
                )
                .await?;

            // Holding pen for transiently-failed admission checks.
            channel
                .exchange_declare(
                    SIGNALS_ADMISSION_RETRY_EXCHANGE.into(),
                    ExchangeKind::Fanout,
                    ExchangeDeclareOptions {
                        durable: true,
                        ..Default::default()
                    },
                    FieldTable::default(),
                )
                .await?;

            let mut admission_retry_args = quorum_queue_args.clone();
            admission_retry_args.insert(
                "x-dead-letter-exchange".into(),
                lapin::types::AMQPValue::LongString(SIGNALS_ADMISSION_EXCHANGE.into()),
            );
            // The target is a fanout exchange, which ignores routing keys —
            // set explicitly so the return path doesn't silently depend on
            // that if the exchange kind ever changes.
            admission_retry_args.insert(
                "x-dead-letter-routing-key".into(),
                lapin::types::AMQPValue::LongString(SIGNALS_ADMISSION_ROUTING_KEY.into()),
            );

            channel
                .queue_declare(
                    SIGNALS_ADMISSION_RETRY_QUEUE.into(),
                    QueueDeclareOptions {
                        durable: true,
                        ..Default::default()
                    },
                    admission_retry_args,
                )
                .await?;

            channel
                .queue_bind(
                    SIGNALS_ADMISSION_RETRY_QUEUE.into(),
                    SIGNALS_ADMISSION_RETRY_EXCHANGE.into(),
                    SIGNALS_ADMISSION_RETRY_ROUTING_KEY.into(),
                    lapin::options::QueueBindOptions::default(),
                    FieldTable::default(),
                )
                .await?;
        }

        // ==== 3.11 Logs message queue ====
        channel
            .exchange_declare(
                LOGS_EXCHANGE.into(),
                ExchangeKind::Fanout,
                ExchangeDeclareOptions {
                    durable: true,
                    ..Default::default()
                },
                FieldTable::default(),
            )
            .await?;

        channel
            .queue_declare(
                LOGS_QUEUE.into(),
                QueueDeclareOptions {
                    durable: true,
                    ..Default::default()
                },
                quorum_queue_args.clone(),
            )
            .await?;

        // ==== 3.12 Reports message queue ====
        channel
            .exchange_declare(
                REPORT_TRIGGERS_EXCHANGE.into(),
                ExchangeKind::Fanout,
                ExchangeDeclareOptions {
                    durable: true,
                    ..Default::default()
                },
                FieldTable::default(),
            )
            .await?;

        channel
            .queue_declare(
                REPORT_TRIGGERS_QUEUE.into(),
                QueueDeclareOptions {
                    durable: true,
                    ..Default::default()
                },
                quorum_queue_args.clone(),
            )
            .await?;

        // ==== 3.14 Static prompt message queue ====
        channel
            .exchange_declare(
                STATIC_PROMPT_EXCHANGE.into(),
                ExchangeKind::Fanout,
                ExchangeDeclareOptions {
                    durable: true,
                    ..Default::default()
                },
                FieldTable::default(),
            )
            .await?;

        channel
            .queue_declare(
                STATIC_PROMPT_QUEUE.into(),
                QueueDeclareOptions {
                    durable: true,
                    ..Default::default()
                },
                quorum_queue_args.clone(),
            )
            .await?;

        // ==== 3.15 Versioning queues (one set per VersionKind) ====
        for kind in VersionKind::ALL {
            let queues = kind.queues();
            channel
                .exchange_declare(
                    queues.exchange.into(),
                    ExchangeKind::Fanout,
                    ExchangeDeclareOptions {
                        durable: true,
                        ..Default::default()
                    },
                    FieldTable::default(),
                )
                .await?;

            channel
                .queue_declare(
                    queues.queue.into(),
                    QueueDeclareOptions {
                        durable: true,
                        ..Default::default()
                    },
                    quorum_queue_args.clone(),
                )
                .await?;

            // Delay queue for messages that can't resolve yet. No consumer
            // — messages expire via their per-message TTL and dead-letter
            // back into the kind's exchange for a re-check.
            channel
                .exchange_declare(
                    queues.delay_exchange.into(),
                    ExchangeKind::Fanout,
                    ExchangeDeclareOptions {
                        durable: true,
                        ..Default::default()
                    },
                    FieldTable::default(),
                )
                .await?;

            let mut delay_args = quorum_queue_args.clone();
            delay_args.insert(
                "x-dead-letter-exchange".into(),
                lapin::types::AMQPValue::LongString(queues.exchange.into()),
            );

            channel
                .queue_declare(
                    queues.delay_queue.into(),
                    QueueDeclareOptions {
                        durable: true,
                        ..Default::default()
                    },
                    delay_args,
                )
                .await?;

            channel
                .queue_bind(
                    queues.delay_queue.into(),
                    queues.delay_exchange.into(),
                    queues.delay_routing_key.into(),
                    lapin::options::QueueBindOptions::default(),
                    FieldTable::default(),
                )
                .await?;
        }

        // ==== 3.16 SP regex extraction (demand-driven) queue ====
        // Fed by consumers that hit a version regex-miss (the signals
        // summarizer); failures drop and the next demand retries, so no
        // delay/retry topology.
        channel
            .exchange_declare(
                SP_REGEX_EXTRACTION_EXCHANGE.into(),
                ExchangeKind::Fanout,
                ExchangeDeclareOptions {
                    durable: true,
                    ..Default::default()
                },
                FieldTable::default(),
            )
            .await?;

        channel
            .queue_declare(
                SP_REGEX_EXTRACTION_QUEUE.into(),
                QueueDeclareOptions {
                    durable: true,
                    ..Default::default()
                },
                quorum_queue_args.clone(),
            )
            .await?;

        Ok(())
    })
}
