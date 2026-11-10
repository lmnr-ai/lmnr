//! The exchanges, queues and bindings app-server relies on. Declared on every
//! new publisher connection (`connection.rs`), so a broker that lost its
//! definitions gets them back on reconnect, not only at boot.
//!
//! The main queues are NOT bound here: `get_receiver` binds each one to its
//! exchange when a consumer subscribes. Only the consumer-less waiting/retry
//! delay queues are bound at declare time.

use futures_util::future::BoxFuture;
use lapin::{
    Channel, ExchangeKind,
    options::{ExchangeDeclareOptions, QueueBindOptions, QueueDeclareOptions},
    types::{AMQPValue, FieldTable},
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

/// One broker declaration. `plan()` lists them in the order they are applied,
/// so the per-queue boilerplate lives in one executor instead of every call
/// site.
#[derive(Debug, PartialEq)]
enum Op {
    /// Durable fanout exchange.
    Exchange(&'static str),
    /// Durable quorum queue; `args` carries `x-queue-type` plus any
    /// dead-letter settings.
    Queue {
        name: &'static str,
        args: FieldTable,
    },
    Bind {
        queue: &'static str,
        exchange: &'static str,
        routing_key: &'static str,
    },
}

/// A consumer-less queue whose messages expire via their per-message TTL and
/// dead-letter back into the main queue's exchange.
struct DelayQueue {
    exchange: &'static str,
    queue: &'static str,
    routing_key: &'static str,
    /// The dead-letter target is a fanout exchange, which ignores routing
    /// keys. Set explicitly so the return path doesn't silently depend on
    /// that if the exchange kind ever changes.
    dead_letter_routing_key: Option<&'static str>,
}

/// An main queue (the one a worker consumes) plus up to two delay queues:
/// `waiting` for messages that can't proceed yet, `retry` for transiently
/// failed ones. Separate so the two delays stay independent knobs.
struct MainQueue {
    exchange: &'static str,
    queue: &'static str,
    waiting: Option<DelayQueue>,
    retry: Option<DelayQueue>,
}

fn quorum_args() -> FieldTable {
    let mut args = FieldTable::default();
    args.insert(
        "x-queue-type".into(),
        AMQPValue::LongString("quorum".into()),
    );
    args
}

fn add_plain_queue(ops: &mut Vec<Op>, exchange: &'static str, queue: &'static str) {
    ops.push(Op::Exchange(exchange));
    ops.push(Op::Queue {
        name: queue,
        args: quorum_args(),
    });
}

fn add_main_queue(ops: &mut Vec<Op>, main: MainQueue) {
    add_plain_queue(ops, main.exchange, main.queue);
    for delay in [main.waiting, main.retry].into_iter().flatten() {
        let mut args = quorum_args();
        args.insert(
            "x-dead-letter-exchange".into(),
            AMQPValue::LongString(main.exchange.into()),
        );
        if let Some(key) = delay.dead_letter_routing_key {
            args.insert(
                "x-dead-letter-routing-key".into(),
                AMQPValue::LongString(key.into()),
            );
        }
        ops.push(Op::Exchange(delay.exchange));
        ops.push(Op::Queue {
            name: delay.queue,
            args,
        });
        ops.push(Op::Bind {
            queue: delay.queue,
            exchange: delay.exchange,
            routing_key: delay.routing_key,
        });
    }
}

/// The signals agent's queues: main + waiting + retry delay queues. Realtime serves
/// trigger runs and backfill serves job runs, so a large backfill scales on
/// its own workers and never queues realtime traffic behind it. The admission
/// gate in front of realtime uses the same shape because it delays and retries
/// for its own reasons and must not push that churn onto the agent's queue.
#[cfg(feature = "signals")]
fn signals_main_queues() -> [MainQueue; 3] {
    [
        MainQueue {
            exchange: SIGNALS_REALTIME_EXCHANGE,
            queue: SIGNALS_REALTIME_QUEUE,
            waiting: Some(DelayQueue {
                exchange: SIGNALS_REALTIME_WAITING_EXCHANGE,
                queue: SIGNALS_REALTIME_WAITING_QUEUE,
                routing_key: SIGNALS_REALTIME_WAITING_ROUTING_KEY,
                dead_letter_routing_key: None,
            }),
            retry: Some(DelayQueue {
                exchange: SIGNALS_REALTIME_RETRY_EXCHANGE,
                queue: SIGNALS_REALTIME_RETRY_QUEUE,
                routing_key: SIGNALS_REALTIME_RETRY_ROUTING_KEY,
                dead_letter_routing_key: Some(SIGNALS_REALTIME_ROUTING_KEY),
            }),
        },
        MainQueue {
            exchange: SIGNALS_BACKFILL_EXCHANGE,
            queue: SIGNALS_BACKFILL_QUEUE,
            waiting: Some(DelayQueue {
                exchange: SIGNALS_BACKFILL_WAITING_EXCHANGE,
                queue: SIGNALS_BACKFILL_WAITING_QUEUE,
                routing_key: SIGNALS_BACKFILL_WAITING_ROUTING_KEY,
                dead_letter_routing_key: None,
            }),
            retry: Some(DelayQueue {
                exchange: SIGNALS_BACKFILL_RETRY_EXCHANGE,
                queue: SIGNALS_BACKFILL_RETRY_QUEUE,
                routing_key: SIGNALS_BACKFILL_RETRY_ROUTING_KEY,
                dead_letter_routing_key: Some(SIGNALS_BACKFILL_ROUTING_KEY),
            }),
        },
        MainQueue {
            exchange: SIGNALS_ADMISSION_EXCHANGE,
            queue: SIGNALS_ADMISSION_QUEUE,
            waiting: Some(DelayQueue {
                exchange: SIGNALS_ADMISSION_WAITING_EXCHANGE,
                queue: SIGNALS_ADMISSION_WAITING_QUEUE,
                routing_key: SIGNALS_ADMISSION_WAITING_ROUTING_KEY,
                dead_letter_routing_key: None,
            }),
            retry: Some(DelayQueue {
                exchange: SIGNALS_ADMISSION_RETRY_EXCHANGE,
                queue: SIGNALS_ADMISSION_RETRY_QUEUE,
                routing_key: SIGNALS_ADMISSION_RETRY_ROUTING_KEY,
                dead_letter_routing_key: Some(SIGNALS_ADMISSION_ROUTING_KEY),
            }),
        },
    ]
}

fn plan() -> Vec<Op> {
    let mut ops = Vec::new();

    // Single exchange + queue, no waiting/retry delay queues. Failures on the
    // user-task regex agent and SP regex extraction queues drop and the next
    // attempt (cohort accumulator interval / next demand) retries instead;
    // the user-task agent has its own queue because a run takes minutes while
    // a per-trace extraction takes seconds.
    let simple = [
        (OBSERVATIONS_EXCHANGE, OBSERVATIONS_QUEUE),
        (SPANS_DATA_PLANE_EXCHANGE, SPANS_DATA_PLANE_QUEUE),
        (SPANS_INDEXER_EXCHANGE, SPANS_INDEXER_QUEUE),
        (BROWSER_SESSIONS_EXCHANGE, BROWSER_SESSIONS_QUEUE),
        (AUDIT_EXCHANGE, AUDIT_QUEUE),
        (INPUT_EXTRACTION_EXCHANGE, INPUT_EXTRACTION_QUEUE),
        (USER_TASK_REGEX_EXCHANGE, USER_TASK_REGEX_QUEUE),
        (NOTIFICATIONS_EXCHANGE, NOTIFICATIONS_QUEUE),
        (
            NOTIFICATION_DELIVERIES_EXCHANGE,
            NOTIFICATION_DELIVERIES_QUEUE,
        ),
    ];
    for (exchange, queue) in simple {
        add_plain_queue(&mut ops, exchange, queue);
    }

    #[cfg(feature = "signals")]
    {
        add_plain_queue(&mut ops, EVENT_CLUSTERING_EXCHANGE, EVENT_CLUSTERING_QUEUE);
        add_plain_queue(
            &mut ops,
            EVENT_CLUSTERING_BATCH_EXCHANGE,
            EVENT_CLUSTERING_BATCH_QUEUE,
        );
        for main in signals_main_queues() {
            add_main_queue(&mut ops, main);
        }
    }

    for (exchange, queue) in [
        (LOGS_EXCHANGE, LOGS_QUEUE),
        (REPORT_TRIGGERS_EXCHANGE, REPORT_TRIGGERS_QUEUE),
        (STATIC_PROMPT_EXCHANGE, STATIC_PROMPT_QUEUE),
    ] {
        add_plain_queue(&mut ops, exchange, queue);
    }

    // One set per VersionKind. The delay queue holds messages that can't
    // resolve yet and dead-letters them back into the kind's exchange for a
    // re-check.
    for kind in VersionKind::ALL {
        let queues = kind.queues();
        add_main_queue(
            &mut ops,
            MainQueue {
                exchange: queues.exchange,
                queue: queues.queue,
                waiting: Some(DelayQueue {
                    exchange: queues.delay_exchange,
                    queue: queues.delay_queue,
                    routing_key: queues.delay_routing_key,
                    dead_letter_routing_key: None,
                }),
                retry: None,
            },
        );
    }

    add_plain_queue(
        &mut ops,
        SP_REGEX_EXTRACTION_EXCHANGE,
        SP_REGEX_EXTRACTION_QUEUE,
    );

    ops
}

pub fn declare_topology(channel: &Channel) -> BoxFuture<'_, anyhow::Result<()>> {
    Box::pin(async move {
        for op in plan() {
            match op {
                Op::Exchange(name) => {
                    channel
                        .exchange_declare(
                            name.into(),
                            ExchangeKind::Fanout,
                            ExchangeDeclareOptions {
                                durable: true,
                                ..Default::default()
                            },
                            FieldTable::default(),
                        )
                        .await?;
                }
                Op::Queue { name, args } => {
                    channel
                        .queue_declare(
                            name.into(),
                            QueueDeclareOptions {
                                durable: true,
                                ..Default::default()
                            },
                            args,
                        )
                        .await?;
                }
                Op::Bind {
                    queue,
                    exchange,
                    routing_key,
                } => {
                    channel
                        .queue_bind(
                            queue.into(),
                            exchange.into(),
                            routing_key.into(),
                            QueueBindOptions::default(),
                            FieldTable::default(),
                        )
                        .await?;
                }
            }
        }
        Ok(())
    })
}
