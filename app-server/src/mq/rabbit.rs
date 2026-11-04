use backon::Retryable;
use deadpool::managed::{Manager, Pool, PoolError, RecycleError};
use futures_util::StreamExt;
use lapin::{
    Acker, BasicProperties, Channel, ConnectionStatus, Consumer,
    options::{BasicConsumeOptions, BasicPublishOptions, BasicQosOptions, QueueBindOptions},
    types::{AMQPValue, FieldTable, ShortString},
};
use std::sync::{Arc, LazyLock};
use std::time::Duration;

use super::{
    MessageQueueAcker, MessageQueueDelivery, MessageQueueDeliveryTrait, MessageQueueReceiver,
    MessageQueueReceiverTrait, MessageQueueTrait, connection::ResilientRabbitConnection,
};
use crate::utils::retry;

/// `backon` decides retryability from the error value alone, so the publish
/// closure's failures — all `anyhow::Error` — need the transient/permanent
/// split that `backoff::Error` used to carry alongside them.
#[derive(thiserror::Error, Debug)]
enum PublishError {
    #[error("{0}")]
    Transient(anyhow::Error),
    #[error("{0}")]
    Permanent(anyhow::Error),
}

/// Whole-chain timeout for consumer setup (`create_channel` → `basic_qos` →
/// `queue_bind` → `basic_consume`). Tunable because a memory-pressured broker
/// can leave channel ops stalled for tens of seconds before the alarm clears.
static CONSUMER_SETUP_TIMEOUT: LazyLock<Duration> =
    LazyLock::new(|| Duration::from_secs(crate::env::mq::CONSUMER_SETUP_TIMEOUT_SECS.get()));

/// Carries the delayed-retry count across a retry-queue round trip. RabbitMQ
/// preserves headers through dead-lettering, so the value survives the hop back
/// into the origin queue.
const RETRY_ATTEMPT_HEADER: &str = "x-lmnr-retry-attempt";

/// Properties common to every publish: `delivery_mode=2` is persistent, and the
/// TTL and priority are applied only when the caller asked for them — an absent
/// priority is what lets a quorum queue apply its own default (4).
fn properties(ttl_ms: Option<u64>, priority: Option<u8>) -> BasicProperties {
    let mut properties = BasicProperties::default().with_delivery_mode(2);

    if let Some(ttl_ms) = ttl_ms {
        properties = properties.with_expiration(ShortString::from(ttl_ms.to_string()));
    }
    if let Some(priority) = priority {
        properties = properties.with_priority(priority);
    }

    properties
}

fn retry_properties(ttl_ms: u64, attempt: u32, priority: Option<u8>) -> BasicProperties {
    let mut headers = FieldTable::default();
    headers.insert(RETRY_ATTEMPT_HEADER.into(), AMQPValue::LongUInt(attempt));

    properties(Some(ttl_ms), priority).with_headers(headers)
}

/// Anything but the `LongUInt` written by `retry_properties` reads as a first
/// delivery, which restarts the budget rather than dropping the message early.
fn retry_attempt_of(properties: &BasicProperties) -> u32 {
    properties
        .headers()
        .as_ref()
        .and_then(|headers| headers.inner().get(RETRY_ATTEMPT_HEADER))
        .and_then(|value| match value {
            AMQPValue::LongUInt(n) => Some(*n),
            _ => None,
        })
        .unwrap_or(0)
}

/// Per-attempt bound on `create_channel`, so a half-dead connection fails the
/// attempt instead of hanging the publish that asked for a channel.
const CREATE_CHANNEL_TIMEOUT: Duration = Duration::from_secs(10);

/// A pooled publisher channel, tagged with the connection generation it was
/// opened on so the pool drops it once that connection has been replaced.
pub struct PooledChannel {
    channel: Channel,
    generation: u64,
}

struct RabbitChannelManager {
    connection: Arc<ResilientRabbitConnection>,
}

impl Manager for RabbitChannelManager {
    type Type = PooledChannel;
    type Error = anyhow::Error;

    async fn create(&self) -> Result<PooledChannel, Self::Error> {
        let create_channel = || async {
            let generation = self.connection.current();
            if !generation.is_usable() {
                return Err(anyhow::anyhow!(
                    "Publisher connection generation {} is not usable",
                    generation.id
                ));
            }
            match tokio::time::timeout(
                CREATE_CHANNEL_TIMEOUT,
                generation.connection.create_channel(),
            )
            .await
            {
                Ok(Ok(channel)) => Ok(PooledChannel {
                    channel,
                    generation: generation.id,
                }),
                Ok(Err(e)) => Err(anyhow::Error::from(e)),
                Err(_) => Err(anyhow::anyhow!("Timed out creating a channel")),
            }
        };
        let backoff = retry::bounded_delay(
            Duration::from_millis(100),
            Duration::from_secs(5),
            Duration::from_secs(30),
        );

        match create_channel
            .retry(backoff)
            .notify(|e, _| log::warn!("Failed to create channel: {:?}", e))
            .await
        {
            Ok(channel) => {
                log::debug!("Successfully created channel");
                Ok(channel)
            }
            Err(e) => {
                log::error!("Failed to create channel after retries: {:?}", e);
                Err(anyhow::anyhow!(
                    "Failed to create channel after retries: {:?}",
                    e
                ))
            }
        }
    }

    async fn recycle(
        &self,
        pooled: &mut PooledChannel,
        _: &deadpool::managed::Metrics,
    ) -> deadpool::managed::RecycleResult<Self::Error> {
        if pooled.generation != self.connection.current().id {
            log::debug!("Channel belongs to a replaced connection, marking for recycling");
            return Err(RecycleError::Backend(anyhow::anyhow!(
                "Channel belongs to a replaced connection"
            )));
        }
        if pooled.channel.status().connected() {
            Ok(())
        } else {
            log::debug!("Channel is not connected, marking for recycling");
            Err(RecycleError::Backend(anyhow::anyhow!(
                "Channel disconnected"
            )))
        }
    }
}

pub struct RabbitMQ {
    publisher_connection: Arc<ResilientRabbitConnection>,
    consumer_connection: Option<Arc<ResilientRabbitConnection>>,
    publisher_channel_pool: Pool<RabbitChannelManager>,
}

pub struct RabbitMQReceiver {
    consumer: Consumer,
}

pub struct RabbitMQDelivery {
    acker: Acker,
    data: Vec<u8>,
    delivery_tag: u64,
    retry_attempt: u32,
    priority: Option<u8>,
}

impl MessageQueueDeliveryTrait for RabbitMQDelivery {
    fn acker(&self) -> MessageQueueAcker {
        MessageQueueAcker::RabbitAcker(self.acker.clone())
    }

    fn data(self) -> Vec<u8> {
        self.data
    }

    fn delivery_tag(&self) -> u64 {
        self.delivery_tag
    }

    fn retry_attempt(&self) -> u32 {
        self.retry_attempt
    }

    fn priority(&self) -> Option<u8> {
        self.priority
    }
}

impl MessageQueueReceiverTrait for RabbitMQReceiver {
    async fn receive(&mut self) -> Option<anyhow::Result<MessageQueueDelivery>> {
        if let Some(delivery) = self.consumer.next().await {
            let Ok(delivery) = delivery else {
                return Some(Err(anyhow::anyhow!(
                    "Failed to get delivery from RabbitMQ."
                )));
            };

            Some(Ok(MessageQueueDelivery::Rabbit(RabbitMQDelivery {
                acker: delivery.acker,
                data: delivery.data,
                delivery_tag: delivery.delivery_tag,
                retry_attempt: retry_attempt_of(&delivery.properties),
                priority: *delivery.properties.priority(),
            })))
        } else {
            None
        }
    }
}

impl RabbitMQ {
    pub fn new(
        publisher_connection: Arc<ResilientRabbitConnection>,
        consumer_connection: Option<Arc<ResilientRabbitConnection>>,
        max_channel_pool_size: usize,
    ) -> Self {
        let manager = RabbitChannelManager {
            connection: Arc::clone(&publisher_connection),
        };

        let pool = Pool::builder(manager)
            .max_size(max_channel_pool_size)
            .build()
            .unwrap();

        Self {
            publisher_connection,
            consumer_connection,
            publisher_channel_pool: pool,
        }
    }

    /// Publish with pre-built properties, using a channel from the pool to avoid
    /// creating a new channel for each message.
    async fn publish_inner(
        &self,
        message: &[u8],
        exchange: &str,
        routing_key: &str,
        properties: BasicProperties,
    ) -> anyhow::Result<()> {
        let publish_with_retry = || async {
            let pooled = match self.publisher_channel_pool.get().await {
                Ok(pooled) => pooled,
                Err(PoolError::Backend(e)) => {
                    log::warn!("Failed to get channel from pool: {}", e);
                    return Err(PublishError::Transient(anyhow::anyhow!(
                        "Failed to get channel from pool: {}",
                        e
                    )));
                }
                Err(e) => {
                    log::error!("Pool error: {}", e);
                    return Err(PublishError::Permanent(anyhow::anyhow!(
                        "Pool error: {}",
                        e
                    )));
                }
            };

            let channel = &pooled.channel;
            // Check if channel is still connected before using it
            if !channel.status().connected() {
                log::warn!("Channel is not connected, retrying...");
                return Err(PublishError::Transient(anyhow::anyhow!(
                    "Channel is not connected"
                )));
            }

            match channel
                .basic_publish(
                    exchange.into(),
                    routing_key.into(),
                    BasicPublishOptions::default(),
                    message,
                    properties.clone(),
                )
                .await
            {
                Ok(promise) => match promise.await {
                    Ok(_confirmation) => Ok(()),
                    Err(e) => {
                        log::warn!("Failed to publish message promise: {:?}", e);
                        Err(PublishError::Transient(anyhow::Error::from(e)))
                    }
                },
                Err(e) => {
                    log::warn!("Failed to get call promise from basic_publish: {:?}", e);
                    Err(PublishError::Transient(anyhow::Error::from(e)))
                }
            }
        };

        let backoff = retry::bounded_delay(
            Duration::from_millis(100),
            Duration::from_secs(2),
            Duration::from_secs(60),
        );

        match publish_with_retry
            .retry(backoff)
            .when(|e| matches!(e, PublishError::Transient(_)))
            .await
        {
            Ok(()) => Ok(()),
            Err(e) => {
                log::error!("Failed to publish message after retries: {:?}", e);
                Err(anyhow::anyhow!(
                    "Failed to publish message after retries: {:?}",
                    e
                ))
            }
        }
    }
}

impl MessageQueueTrait for RabbitMQ {
    async fn publish(
        &self,
        message: &[u8],
        exchange: &str,
        routing_key: &str,
        ttl_ms: Option<u64>,
    ) -> anyhow::Result<()> {
        self.publish_inner(message, exchange, routing_key, properties(ttl_ms, None))
            .await
    }

    async fn publish_with_priority(
        &self,
        message: &[u8],
        exchange: &str,
        routing_key: &str,
        ttl_ms: Option<u64>,
        priority: u8,
    ) -> anyhow::Result<()> {
        self.publish_inner(
            message,
            exchange,
            routing_key,
            properties(ttl_ms, Some(priority)),
        )
        .await
    }

    async fn publish_retry(
        &self,
        message: &[u8],
        exchange: &str,
        routing_key: &str,
        ttl_ms: u64,
        attempt: u32,
        priority: Option<u8>,
    ) -> anyhow::Result<()> {
        self.publish_inner(
            message,
            exchange,
            routing_key,
            retry_properties(ttl_ms, attempt, priority),
        )
        .await
    }

    async fn get_receiver(
        &self,
        queue_name: &str,
        exchange: &str,
        routing_key: &str,
        prefetch_count: u16,
    ) -> anyhow::Result<MessageQueueReceiver> {
        let consumer_conn = self.consumer_connection.as_ref().ok_or_else(|| {
            anyhow::anyhow!(
                "Consumer connection not available - running in producer-only mode. \
                 Cannot create receiver for queue '{}'",
                queue_name
            )
        })?;

        // Waiting for a turn is NOT under the setup timeout: after a reconnect
        // every worker queues here, and the timeout is for the broker's answer.
        let _permit = consumer_conn.setup_permit().await;

        let generation = consumer_conn.current();
        if !generation.is_usable() {
            return Err(anyhow::anyhow!(
                "Consumer connection generation {} is not usable (state: {:?})",
                generation.id,
                connection_state(generation.connection.status())
            ));
        }

        // Bound the entire setup chain. lapin can hang inside `basic_consume` /
        // `create_channel` against a half-dead connection; without this the
        // worker's outer backoff retry never fires another attempt.
        let setup = async {
            let channel = generation
                .connection
                .create_channel()
                .await
                .map_err(|e| anyhow::Error::from(e))?;

            channel
                .basic_qos(prefetch_count, BasicQosOptions::default())
                .await?;

            // The origin queues are bound to their exchanges only here, never
            // at declare time, so this can't be dropped — just done once per
            // connection rather than once per worker.
            if generation.needs_binding(queue_name, exchange, routing_key) {
                channel
                    .queue_bind(
                        queue_name.into(),
                        exchange.into(),
                        routing_key.into(),
                        QueueBindOptions::default(),
                        FieldTable::default(),
                    )
                    .await?;
                generation.record_binding(queue_name, exchange, routing_key);
            }

            let consumer = channel
                .basic_consume(
                    queue_name.into(),
                    routing_key.into(),
                    BasicConsumeOptions::default(),
                    FieldTable::default(),
                )
                .await?;

            anyhow::Ok(consumer)
        };

        let consumer = match tokio::time::timeout(*CONSUMER_SETUP_TIMEOUT, setup).await {
            Ok(Ok(consumer)) => {
                consumer_conn.record_setup_success(&generation);
                consumer
            }
            // The broker answered, so the connection isn't wedged; the worker's
            // backoff retries this queue on its own.
            Ok(Err(e)) => return Err(e),
            Err(_) => {
                consumer_conn.record_setup_timeout(&generation);
                return Err(anyhow::anyhow!(
                    "Timed out setting up RabbitMQ consumer for queue '{}' on connection generation {}",
                    queue_name,
                    generation.id
                ));
            }
        };

        Ok(RabbitMQReceiver { consumer }.into())
    }

    fn is_healthy(&self) -> bool {
        let publisher_ok = self.publisher_connection.is_connected();
        if !publisher_ok {
            log::error!(
                "RabbitMQ readiness: publisher connection is not connected (state: {:?})",
                connection_state(self.publisher_connection.current().connection.status())
            );
        }

        let consumer_ok = self
            .consumer_connection
            .as_ref()
            .map(|c| {
                let connected = c.is_connected();
                if !connected {
                    log::error!(
                        "RabbitMQ readiness: consumer connection is not connected (state: {:?})",
                        connection_state(c.current().connection.status())
                    );
                }
                connected
            })
            .unwrap_or(true);

        publisher_ok && consumer_ok
    }
}

fn connection_state(status: &ConnectionStatus) -> String {
    let s = if status.blocked() {
        "blocked"
    } else if status.closed() {
        "closed"
    } else if status.closing() {
        "closing"
    } else if status.connected() {
        "connected"
    } else if status.connecting() {
        "connecting"
    } else if status.errored() {
        "errored"
    } else if status.reconnecting() {
        "reconnecting"
    } else {
        "unknown"
    };
    s.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn retry_attempt_round_trips_through_message_properties() {
        assert_eq!(retry_attempt_of(&retry_properties(30_000, 7, None)), 7);
    }

    #[test]
    fn a_parked_message_keeps_the_priority_it_arrived_with() {
        // The park is the round trip a priority is most easily lost on: the
        // worker republishes raw bytes, so anything not re-stamped here is gone
        // by the time the broker dead-letters the message back.
        let parked = retry_properties(30_000, 1, Some(8));

        assert_eq!(*parked.priority(), Some(8));
        assert_eq!(retry_attempt_of(&parked), 1);
    }

    #[test]
    fn an_unprioritized_publish_sets_no_priority_at_all() {
        // Absent, not zero: the quorum queue reads an absent property as 4, and
        // an explicit 0 would sort BELOW everything instead of alongside it.
        assert_eq!(*properties(None, None).priority(), None);
        assert_eq!(*retry_properties(30_000, 0, None).priority(), None);
    }

    #[test]
    fn a_priority_publish_carries_both_the_ttl_and_the_priority() {
        let properties = properties(Some(30_000), Some(8));

        assert_eq!(*properties.priority(), Some(8));
        assert_eq!(
            properties.expiration().as_ref().map(|e| e.to_string()),
            Some("30000".to_string())
        );
    }

    #[test]
    fn retry_attempt_of_a_first_delivery_is_zero() {
        // Nothing published by `publish` carries the header.
        let properties = BasicProperties::default().with_delivery_mode(2);
        assert_eq!(retry_attempt_of(&properties), 0);

        let mut headers = FieldTable::default();
        headers.insert("x-death".into(), AMQPValue::LongUInt(4));
        assert_eq!(
            retry_attempt_of(&BasicProperties::default().with_headers(headers)),
            0
        );
    }

    #[test]
    fn a_header_written_by_something_else_restarts_the_budget() {
        // Not written by `retry_properties`, so the count is unusable. Restarting
        // is the safe reading — it retries more, it doesn't drop early.
        let mut wrong_type = FieldTable::default();
        wrong_type.insert(
            RETRY_ATTEMPT_HEADER.into(),
            AMQPValue::LongString("3".into()),
        );
        assert_eq!(
            retry_attempt_of(&BasicProperties::default().with_headers(wrong_type)),
            0
        );
    }

    /// Drops every broker-side connection AND deletes the queue, then checks that
    /// both connections are replaced, the topology is redeclared on the new
    /// publisher connection, the binding is redone on the new consumer one, and
    /// messages flow again. Run with `--ignored` against a broker at
    /// `RABBITMQ_TEST_URL` (default `amqp://guest:guest@localhost:5672/%2f`),
    /// with `rabbitmqctl` on `PATH` or at `RABBITMQCTL`.
    mod live_reconnect {
        use std::process::Command;

        use futures_util::future::BoxFuture;
        use lapin::{
            ExchangeKind,
            options::{ExchangeDeclareOptions, QueueDeclareOptions},
        };

        use super::*;
        use crate::mq::{MessageQueue, MessageQueueDeliveryTrait};

        const EXCHANGE: &str = "lmnr_test_reconnect_exchange";
        const QUEUE: &str = "lmnr_test_reconnect_queue";
        const ROUTING_KEY: &str = "lmnr_test_reconnect";

        fn declare(channel: &Channel) -> BoxFuture<'_, anyhow::Result<()>> {
            Box::pin(async move {
                channel
                    .exchange_declare(
                        EXCHANGE.into(),
                        ExchangeKind::Fanout,
                        ExchangeDeclareOptions {
                            durable: true,
                            ..Default::default()
                        },
                        FieldTable::default(),
                    )
                    .await?;
                let mut args = FieldTable::default();
                args.insert(
                    "x-queue-type".into(),
                    AMQPValue::LongString("quorum".into()),
                );
                channel
                    .queue_declare(
                        QUEUE.into(),
                        QueueDeclareOptions {
                            durable: true,
                            ..Default::default()
                        },
                        args,
                    )
                    .await?;
                Ok(())
            })
        }

        fn rabbitmqctl(args: &[&str]) {
            let ctl = std::env::var("RABBITMQCTL").unwrap_or("rabbitmqctl".to_string());
            let status = Command::new(ctl)
                .args(args)
                .status()
                .expect("run rabbitmqctl");
            assert!(status.success(), "rabbitmqctl {args:?} failed");
        }

        async fn receive_one(receiver: &mut MessageQueueReceiver) -> Vec<u8> {
            let delivery = tokio::time::timeout(Duration::from_secs(30), receiver.receive())
                .await
                .expect("no delivery within 30s")
                .expect("consumer ended")
                .expect("delivery error");
            delivery.acker().ack().await.unwrap();
            delivery.data()
        }

        async fn wait_for_generation(connection: &ResilientRabbitConnection, id: u64) {
            tokio::time::timeout(Duration::from_secs(60), async {
                while !(connection.current().id >= id && connection.is_connected()) {
                    tokio::time::sleep(Duration::from_millis(200)).await;
                }
            })
            .await
            .expect("connection was not replaced within 60s");
        }

        #[tokio::test]
        #[ignore]
        async fn consumers_and_publishers_survive_a_dropped_connection() {
            let uri = std::env::var("RABBITMQ_TEST_URL")
                .unwrap_or("amqp://guest:guest@localhost:5672/%2f".to_string());
            let publisher =
                ResilientRabbitConnection::connect(uri.clone(), "test-publisher", Some(declare))
                    .await
                    .unwrap();
            let consumer = ResilientRabbitConnection::connect(uri, "test-consumer", None)
                .await
                .unwrap();
            let queue: MessageQueue =
                RabbitMQ::new(Arc::clone(&publisher), Some(Arc::clone(&consumer)), 4).into();

            let mut receiver = queue
                .get_receiver(QUEUE, EXCHANGE, ROUTING_KEY, 10)
                .await
                .unwrap();
            queue
                .publish(b"before", EXCHANGE, ROUTING_KEY, None)
                .await
                .unwrap();
            assert_eq!(receive_one(&mut receiver).await, b"before");

            // A broker that lost its definitions, then lost every connection.
            rabbitmqctl(&["delete_queue", QUEUE]);
            rabbitmqctl(&["close_all_connections", "test"]);

            // Without lapin's recovery the consumer must END, not idle forever.
            let ended = tokio::time::timeout(Duration::from_secs(30), async {
                loop {
                    match receiver.receive().await {
                        Some(Ok(_)) => continue,
                        Some(Err(_)) | None => break,
                    }
                }
            })
            .await;
            assert!(
                ended.is_ok(),
                "the old consumer never surfaced the dead connection"
            );

            wait_for_generation(&publisher, 1).await;
            wait_for_generation(&consumer, 1).await;

            let mut receiver = queue
                .get_receiver(QUEUE, EXCHANGE, ROUTING_KEY, 10)
                .await
                .unwrap();
            queue
                .publish(b"after", EXCHANGE, ROUTING_KEY, None)
                .await
                .unwrap();
            assert_eq!(receive_one(&mut receiver).await, b"after");
            assert!(queue.is_healthy());

            rabbitmqctl(&["delete_queue", QUEUE]);
        }
    }
}
