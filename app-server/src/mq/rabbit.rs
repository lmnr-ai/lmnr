use backon::Retryable;
use deadpool::managed::{Manager, Pool, PoolError, RecycleError};
use futures_util::StreamExt;
use lapin::{
    Acker, BasicProperties, Channel, Confirmation, Connection, ConnectionStatus, Consumer,
    options::{
        BasicConsumeOptions, BasicPublishOptions, BasicQosOptions, ConfirmSelectOptions,
        QueueBindOptions,
    },
    types::{AMQPValue, FieldTable, ShortString},
};
use std::sync::{Arc, LazyLock};
use std::time::Duration;

use super::{
    MessageQueueAcker, MessageQueueDelivery, MessageQueueDeliveryTrait, MessageQueueReceiver,
    MessageQueueReceiverTrait, MessageQueueTrait,
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

/// Per-attempt timeout for opening a publisher channel. lapin can hang in
/// `create_channel` against a half-dead connection, which would otherwise stall
/// the retry loop on its first attempt.
const PUBLISHER_CHANNEL_SETUP_TIMEOUT: Duration = Duration::from_secs(10);

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

/// Only a broker ack makes a publish durable. A nack means the broker refused
/// the message (an internal queue error, or a `reject-publish` overflow), so it is retried.
/// `NotRequested` means the channel lost confirm mode: retrying gets a fresh
/// channel, because `recycle` discards it.
fn confirmation_result(confirmation: Confirmation) -> Result<(), PublishError> {
    match confirmation {
        Confirmation::Ack(_) => Ok(()),
        Confirmation::Nack(_) => Err(PublishError::Transient(anyhow::anyhow!(
            "Broker nacked the published message"
        ))),
        Confirmation::NotRequested => Err(PublishError::Transient(anyhow::anyhow!(
            "Publisher confirms are not enabled on the channel"
        ))),
    }
}

struct RabbitChannelManager {
    connection: Arc<Connection>,
}

impl Manager for RabbitChannelManager {
    type Type = Channel;
    type Error = anyhow::Error;

    async fn create(&self) -> Result<Channel, Self::Error> {
        // Confirm mode is what makes `basic_publish`'s promise wait for the broker;
        // without it the promise resolves immediately. lapin re-enables it when it
        // recovers the channel.
        let create_channel = || async {
            let setup = async {
                let channel = self.connection.create_channel().await?;
                channel
                    .confirm_select(ConfirmSelectOptions::default())
                    .await?;
                anyhow::Ok(channel)
            };
            tokio::time::timeout(PUBLISHER_CHANNEL_SETUP_TIMEOUT, setup)
                .await
                .map_err(|_| anyhow::anyhow!("Timed out creating channel"))?
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
        channel: &mut Channel,
        _: &deadpool::managed::Metrics,
    ) -> deadpool::managed::RecycleResult<Self::Error> {
        if !channel.status().connected() {
            log::debug!("Channel is not connected, marking for recycling");
            Err(RecycleError::Backend(anyhow::anyhow!(
                "Channel disconnected"
            )))
        } else if !channel.status().confirm() {
            log::warn!("Channel is not in confirm mode, marking for recycling");
            Err(RecycleError::Backend(anyhow::anyhow!(
                "Channel not in confirm mode"
            )))
        } else {
            Ok(())
        }
    }
}

pub struct RabbitMQ {
    publisher_connection: Arc<Connection>,
    consumer_connection: Option<Arc<Connection>>,
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
        publisher_connection: Arc<Connection>,
        consumer_connection: Option<Arc<Connection>>,
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
            let channel = match self.publisher_channel_pool.get().await {
                Ok(channel) => channel,
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

            // Check if channel is still connected before using it
            if !channel.status().connected() {
                log::warn!("Channel is not connected, retrying...");
                return Err(PublishError::Transient(anyhow::anyhow!(
                    "Channel is not connected"
                )));
            }

            let confirm = match channel
                .basic_publish(
                    exchange.into(),
                    routing_key.into(),
                    BasicPublishOptions::default(),
                    message,
                    properties.clone(),
                )
                .await
            {
                Ok(confirm) => confirm,
                Err(e) => {
                    log::warn!("Failed to get call promise from basic_publish: {:?}", e);
                    return Err(PublishError::Transient(anyhow::Error::from(e)));
                }
            };
            // A channel carries many outstanding confirms, so return it to the
            // pool instead of holding it for the broker round trip.
            drop(channel);

            match confirm.await {
                Ok(confirmation) => confirmation_result(confirmation).inspect_err(|e| {
                    log::warn!("Publish not confirmed: {}", e);
                }),
                Err(e) => {
                    log::warn!("Failed to publish message promise: {:?}", e);
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

        if !consumer_conn.status().connected() {
            return Err(anyhow::anyhow!(
                "Consumer connection is not in connected state: {:?}",
                connection_state(consumer_conn.status())
            ));
        }

        // Bound the entire setup chain. lapin can hang inside `basic_consume` /
        // `create_channel` against a half-dead connection; without this the
        // worker's outer backoff retry never fires another attempt.
        let setup = async {
            let channel = consumer_conn
                .create_channel()
                .await
                .map_err(|e| anyhow::Error::from(e))?;

            channel
                .basic_qos(prefetch_count, BasicQosOptions::default())
                .await?;

            channel
                .queue_bind(
                    queue_name.into(),
                    exchange.into(),
                    routing_key.into(),
                    QueueBindOptions::default(),
                    FieldTable::default(),
                )
                .await?;

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
            Ok(Ok(consumer)) => consumer,
            Ok(Err(e)) => return Err(e),
            Err(_) => {
                return Err(anyhow::anyhow!(
                    "Timed out setting up RabbitMQ consumer for queue '{}'",
                    queue_name
                ));
            }
        };

        Ok(RabbitMQReceiver { consumer }.into())
    }

    fn is_healthy(&self) -> bool {
        let publisher_ok = self.publisher_connection.status().connected();
        if !publisher_ok {
            log::error!(
                "RabbitMQ readiness: publisher connection is not connected (state: {:?})",
                connection_state(self.publisher_connection.status())
            );
        }

        let consumer_ok = self
            .consumer_connection
            .as_ref()
            .map(|c| {
                let connected = c.status().connected();
                if !connected {
                    log::error!(
                        "RabbitMQ readiness: consumer connection is not connected (state: {:?})",
                        connection_state(c.status())
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
    fn only_a_broker_ack_counts_as_published() {
        assert!(confirmation_result(Confirmation::Ack(None)).is_ok());
        assert!(matches!(
            confirmation_result(Confirmation::Nack(None)),
            Err(PublishError::Transient(_))
        ));
        // Without confirm mode lapin resolves every publish as `NotRequested`,
        // which says nothing about whether the broker stored the message.
        assert!(matches!(
            confirmation_result(Confirmation::NotRequested),
            Err(PublishError::Transient(_))
        ));
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

    /// Needs a broker at `RABBITMQ_URL` (default `amqp://guest:guest@localhost:5672/%2f`).
    /// Run with:
    /// `cargo test --bin app-server mq::rabbit::tests::live -- --ignored --nocapture`
    mod live {
        use lapin::{
            ConnectionProperties,
            options::{QueueDeclareOptions, QueueDeleteOptions},
        };

        use super::*;

        async fn connect() -> Arc<Connection> {
            let url = std::env::var(crate::env::mq::URL)
                .unwrap_or("amqp://guest:guest@localhost:5672/%2f".to_string());
            Arc::new(
                Connection::connect(&url, ConnectionProperties::default())
                    .await
                    .unwrap(),
            )
        }

        /// A queue that holds one message and nacks every publish past it. Classic,
        /// because a quorum queue enforces `reject-publish` only approximately.
        async fn declare_one_slot_queue(connection: &Connection, name: &str) -> Channel {
            let channel = connection.create_channel().await.unwrap();
            let mut args = FieldTable::default();
            args.insert("x-max-length".into(), AMQPValue::LongInt(1));
            args.insert(
                "x-overflow".into(),
                AMQPValue::LongString("reject-publish".into()),
            );
            channel
                .queue_declare(
                    name.into(),
                    QueueDeclareOptions {
                        durable: true,
                        ..QueueDeclareOptions::default()
                    },
                    args,
                )
                .await
                .unwrap();
            channel
        }

        #[tokio::test]
        #[ignore]
        async fn pooled_channels_surface_broker_acks_and_nacks() {
            let connection = connect().await;
            let queue_name = format!("lmnr-test-confirms-{}", uuid::Uuid::new_v4());
            let admin = declare_one_slot_queue(&connection, &queue_name).await;
            let mq = RabbitMQ::new(Arc::clone(&connection), None, 2);

            let publish = || async {
                let channel = mq.publisher_channel_pool.get().await.unwrap();
                channel
                    .basic_publish(
                        "".into(),
                        queue_name.as_str().into(),
                        BasicPublishOptions::default(),
                        b"payload",
                        properties(None, None),
                    )
                    .await
                    .unwrap()
                    .await
                    .unwrap()
            };

            assert!(matches!(publish().await, Confirmation::Ack(_)));
            assert!(matches!(publish().await, Confirmation::Nack(_)));

            admin
                .queue_delete(queue_name.as_str().into(), QueueDeleteOptions::default())
                .await
                .unwrap();
        }

        #[tokio::test]
        #[ignore]
        async fn publish_returns_once_the_broker_has_the_message() {
            let connection = connect().await;
            let queue_name = format!("lmnr-test-confirms-{}", uuid::Uuid::new_v4());
            let admin = declare_one_slot_queue(&connection, &queue_name).await;
            let mq = RabbitMQ::new(Arc::clone(&connection), None, 2);

            mq.publish(b"payload", "", &queue_name, None).await.unwrap();

            let queue = admin
                .queue_declare(
                    queue_name.as_str().into(),
                    QueueDeclareOptions {
                        passive: true,
                        ..QueueDeclareOptions::default()
                    },
                    FieldTable::default(),
                )
                .await
                .unwrap();
            assert_eq!(queue.message_count(), 1);

            admin
                .queue_delete(queue_name.as_str().into(), QueueDeleteOptions::default())
                .await
                .unwrap();
        }
    }
}
