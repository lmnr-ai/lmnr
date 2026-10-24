use backon::Retryable;
use deadpool::managed::{Manager, Object, Pool, PoolError, RecycleError};
use futures_util::StreamExt;
use lapin::{
    Acker, BasicProperties, Channel, Confirmation, Connection, ConnectionStatus, Consumer,
    options::{
        BasicConsumeOptions, BasicPublishOptions, BasicQosOptions, ConfirmSelectOptions,
        QueueBindOptions,
    },
    types::{AMQPValue, FieldTable, ShortString},
};
use std::future::Future;
use std::sync::{Arc, LazyLock};
use std::time::Duration;
use tokio::sync::{OwnedSemaphorePermit, Semaphore};

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

const PUBLISHER_CHANNEL_SETUP_TIMEOUT: Duration = Duration::from_secs(10);
const PUBLISH_ATTEMPT_TIMEOUT: Duration = Duration::from_secs(10);
const RETIRED_CHANNEL_CLOSE_TIMEOUT: Duration = Duration::from_secs(5);
const RETIRED_CHANNEL_POLL_INTERVAL: Duration = Duration::from_millis(200);

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

fn publish_options() -> BasicPublishOptions {
    BasicPublishOptions {
        mandatory: true,
        ..Default::default()
    }
}

fn confirmation_result(confirmation: Confirmation) -> Result<(), PublishError> {
    match confirmation {
        Confirmation::Ack(None) => Ok(()),
        Confirmation::Ack(Some(returned)) | Confirmation::Nack(Some(returned)) => {
            Err(PublishError::Permanent(anyhow::anyhow!(
                "RabbitMQ returned unroutable message: {} ({})",
                returned.reply_text,
                returned.reply_code
            )))
        }
        Confirmation::Nack(None) => Err(PublishError::Transient(anyhow::anyhow!(
            "RabbitMQ negatively acknowledged published message"
        ))),
        Confirmation::NotRequested => Err(PublishError::Permanent(anyhow::anyhow!(
            "RabbitMQ publisher confirms were not enabled"
        ))),
    }
}

#[derive(Debug, PartialEq, Eq)]
enum RetiredChannelAction {
    Wait,
    Close,
    Stop,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum RetiredConnectionPhase {
    Connected,
    Recovering,
    Terminal,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum RetiredChannelPhase {
    Connected,
    Recovering,
    Closing,
    Terminal,
}

fn terminal_connection_state(closing: bool, closed: bool, errored: bool) -> bool {
    closing || closed || errored
}

fn retired_channel_action_for(
    connection: RetiredConnectionPhase,
    channel: RetiredChannelPhase,
) -> RetiredChannelAction {
    match (connection, channel) {
        (RetiredConnectionPhase::Terminal, _)
        | (RetiredConnectionPhase::Connected, RetiredChannelPhase::Terminal) => {
            RetiredChannelAction::Stop
        }
        (RetiredConnectionPhase::Connected, RetiredChannelPhase::Connected) => {
            RetiredChannelAction::Close
        }
        _ => RetiredChannelAction::Wait,
    }
}

fn retired_channel_action(
    connection: &ConnectionStatus,
    channel: &Channel,
) -> RetiredChannelAction {
    let connection = if terminal_connection_state(
        connection.closing(),
        connection.closed(),
        connection.errored(),
    ) {
        RetiredConnectionPhase::Terminal
    } else if connection.connected() {
        RetiredConnectionPhase::Connected
    } else {
        RetiredConnectionPhase::Recovering
    };
    let channel = if channel.status().connected() {
        RetiredChannelPhase::Connected
    } else if channel.status().initializing() {
        RetiredChannelPhase::Recovering
    } else if channel.status().closing() {
        RetiredChannelPhase::Closing
    } else {
        // Lapin removes channels closed by a protocol error. Closed/Error
        // cannot be reopened on a connected connection.
        RetiredChannelPhase::Terminal
    };

    retired_channel_action_for(connection, channel)
}

async fn close_retired_channel(channel: Channel, connection: ConnectionStatus) {
    loop {
        match retired_channel_action(&connection, &channel) {
            RetiredChannelAction::Stop => return,
            RetiredChannelAction::Wait => {}
            RetiredChannelAction::Close => {
                match tokio::time::timeout(
                    RETIRED_CHANNEL_CLOSE_TIMEOUT,
                    channel.close(200, "OK".into()),
                )
                .await
                {
                    Ok(Ok(())) => return,
                    Ok(Err(e)) => log::warn!("Failed to close retired publisher channel: {e}"),
                    Err(_) => log::warn!("Timed out closing retired publisher channel"),
                }

                // Keep ownership after a close error or deadline, including
                // when Lapin still reports Connected. Only a terminal state
                // or a completed Close-Ok can release its capacity.
                if retired_channel_action(&connection, &channel) == RetiredChannelAction::Stop {
                    return;
                }
            }
        }
        tokio::time::sleep(RETIRED_CHANNEL_POLL_INTERVAL).await;
    }
}

async fn run_retired_cleanup<F: Future<Output = ()>>(cleanup: F, permit: OwnedSemaphorePermit) {
    cleanup.await;
    drop(permit);
}

fn retire_channel(channel: Channel, connection: ConnectionStatus, permit: OwnedSemaphorePermit) {
    // Drop can run while a publish future is being cancelled. Detach first,
    // then let the cleanup task hold the channel through any reconnect.
    match tokio::runtime::Handle::try_current() {
        Ok(runtime) => {
            runtime.spawn(run_retired_cleanup(
                close_retired_channel(channel, connection),
                permit,
            ));
        }
        Err(e) => {
            log::warn!("Cannot retire RabbitMQ channel without a Tokio runtime: {e}");
        }
    }
}

/// A setup task may outlive its pool request after the setup deadline or caller
/// cancellation. Its result owns this guard, so even a late channel is retired
/// instead of being dropped while Lapin can still recover it.
struct ChannelSetupGuard {
    channel: Option<Channel>,
    connection: ConnectionStatus,
    permit: Option<OwnedSemaphorePermit>,
}

impl ChannelSetupGuard {
    fn new(channel: Channel, connection: ConnectionStatus, permit: OwnedSemaphorePermit) -> Self {
        Self {
            channel: Some(channel),
            connection,
            permit: Some(permit),
        }
    }

    fn channel(&self) -> &Channel {
        self.channel.as_ref().expect("setup channel exists")
    }

    fn into_channel(mut self) -> Channel {
        self.channel.take().expect("setup channel exists")
    }
}

impl Drop for ChannelSetupGuard {
    fn drop(&mut self) {
        if let Some(channel) = self.channel.take() {
            retire_channel(
                channel,
                self.connection.clone(),
                self.permit.take().expect("setup permit exists"),
            );
        }
    }
}

struct RabbitChannelManager {
    connection: Arc<Connection>,
    setup_slots: Arc<Semaphore>,
}

impl Manager for RabbitChannelManager {
    type Type = Channel;
    type Error = anyhow::Error;

    async fn create(&self) -> Result<Channel, Self::Error> {
        let create_channel = || async {
            // Timed-out setup tasks keep their permits while Lapin is still
            // resolving create_channel/confirm_select. Retries cannot create
            // an unbounded number of detached tasks on a stalled connection.
            let permit = Arc::clone(&self.setup_slots)
                .try_acquire_owned()
                .map_err(|_| anyhow::anyhow!("RabbitMQ publisher channel setup slots exhausted"))?;
            let connection = Arc::clone(&self.connection);
            let setup = tokio::spawn(async move {
                let channel = connection.create_channel().await?;
                let guard = ChannelSetupGuard::new(channel, connection.status().clone(), permit);
                guard
                    .channel()
                    .confirm_select(ConfirmSelectOptions::default())
                    .await?;
                anyhow::Ok(guard)
            });
            let result = tokio::time::timeout(PUBLISHER_CHANNEL_SETUP_TIMEOUT, setup)
                .await
                .map_err(|_| anyhow::anyhow!("Timed out setting up RabbitMQ publisher channel"))?;
            let guard = result??;
            anyhow::Ok(guard.into_channel())
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
        if channel.status().connected() {
            Ok(())
        } else {
            log::debug!("Channel is not connected, marking for recycling");
            Err(RecycleError::Backend(anyhow::anyhow!(
                "Channel disconnected"
            )))
        }
    }
}

/// A publish is unsafe to recycle until a broker confirmation has resolved.
/// Dropping the caller's future also drops this guard, detaching the channel
/// from deadpool before its pending confirm can be confused with another use.
struct PublishChannelGuard {
    channel: Option<Object<RabbitChannelManager>>,
    connection: ConnectionStatus,
    permit: Option<OwnedSemaphorePermit>,
    confirmed: bool,
}

impl PublishChannelGuard {
    fn new(
        channel: Object<RabbitChannelManager>,
        connection: ConnectionStatus,
        permit: OwnedSemaphorePermit,
    ) -> Self {
        Self {
            channel: Some(channel),
            connection,
            permit: Some(permit),
            confirmed: false,
        }
    }

    fn channel(&self) -> &Channel {
        self.channel.as_ref().expect("publisher channel exists")
    }

    fn mark_confirmed(&mut self) {
        self.confirmed = true;
    }
}

impl Drop for PublishChannelGuard {
    fn drop(&mut self) {
        if !self.confirmed {
            if let Some(channel) = self.channel.take() {
                retire_channel(
                    Object::take(channel),
                    self.connection.clone(),
                    self.permit.take().expect("publish permit exists"),
                );
            }
        }
    }
}

pub struct RabbitMQ {
    publisher_connection: Arc<Connection>,
    consumer_connection: Option<Arc<Connection>>,
    publisher_channel_pool: Pool<RabbitChannelManager>,
    publish_slots: Arc<Semaphore>,
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
            setup_slots: Arc::new(Semaphore::new(max_channel_pool_size)),
        };

        let pool = Pool::builder(manager)
            .max_size(max_channel_pool_size)
            .build()
            .unwrap();

        Self {
            publisher_connection,
            consumer_connection,
            publisher_channel_pool: pool,
            publish_slots: Arc::new(Semaphore::new(max_channel_pool_size)),
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
            // A detached channel keeps its permit until cleanup completes.
            // Waiting is bounded so a persistent broker outage still reaches
            // the existing retry deadline instead of hanging this attempt.
            let permit = tokio::time::timeout(
                PUBLISH_ATTEMPT_TIMEOUT,
                Arc::clone(&self.publish_slots).acquire_owned(),
            )
            .await
            .map_err(|_| {
                PublishError::Transient(anyhow::anyhow!(
                    "Timed out waiting for RabbitMQ publisher capacity"
                ))
            })?
            .map_err(|e| PublishError::Permanent(anyhow::Error::from(e)))?;
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

            let mut channel = PublishChannelGuard::new(
                channel,
                self.publisher_connection.status().clone(),
                permit,
            );
            let result = tokio::time::timeout(PUBLISH_ATTEMPT_TIMEOUT, async {
                let promise = channel
                    .channel()
                    .basic_publish(
                        exchange.into(),
                        routing_key.into(),
                        publish_options(),
                        message,
                        properties.clone(),
                    )
                    .await?;
                promise.await
            })
            .await;

            match result {
                Ok(Ok(confirmation)) => {
                    if !matches!(&confirmation, Confirmation::NotRequested) {
                        channel.mark_confirmed();
                    }
                    confirmation_result(confirmation)
                }
                Ok(Err(e)) => {
                    log::warn!("Failed to publish message or await confirmation: {:?}", e);
                    Err(PublishError::Transient(anyhow::Error::from(e)))
                }
                Err(_) => {
                    // A timed-out confirm may still arrive. Never lend this
                    // channel to another publisher while its outcome is unknown.
                    // The guard also retires it if the caller is cancelled.
                    Err(PublishError::Transient(anyhow::anyhow!(
                        "Timed out publishing RabbitMQ message"
                    )))
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
    use lapin::{
        ConnectionProperties,
        message::{BasicReturnMessage, Delivery},
        options::QueueDeclareOptions,
    };

    async fn live_broker() -> Option<(Arc<Connection>, Channel, String)> {
        let url = std::env::var("RABBITMQ_TEST_URL").ok()?;
        let connection = Arc::new(
            Connection::connect(&url, ConnectionProperties::default())
                .await
                .expect("connect to RabbitMQ test broker"),
        );
        let channel = connection.create_channel().await.expect("create channel");
        let queue_name = format!("lmnr-publish-confirm-{}", uuid::Uuid::new_v4());
        channel
            .queue_declare(
                queue_name.clone().into(),
                QueueDeclareOptions::exclusive(),
                FieldTable::default(),
            )
            .await
            .expect("declare test queue");
        Some((connection, channel, queue_name))
    }

    #[test]
    fn only_a_confirmed_routable_publish_succeeds() {
        assert!(confirmation_result(Confirmation::Ack(None)).is_ok());
        let returned = BasicReturnMessage {
            delivery: Delivery::mock(0, "".into(), "missing".into(), false, Vec::new()),
            reply_code: 312,
            reply_text: "NO_ROUTE".into(),
        };
        assert!(matches!(
            confirmation_result(Confirmation::Nack(Some(returned))),
            Err(PublishError::Permanent(_))
        ));
        assert!(matches!(
            confirmation_result(Confirmation::Nack(None)),
            Err(PublishError::Transient(_))
        ));
        assert!(matches!(
            confirmation_result(Confirmation::NotRequested),
            Err(PublishError::Permanent(_))
        ));
    }

    #[test]
    fn publishes_require_a_route() {
        assert!(publish_options().mandatory);
        assert!(!publish_options().immediate);
    }

    #[test]
    fn retired_connection_error_is_terminal_but_recovery_is_not() {
        assert!(terminal_connection_state(false, false, true));
        assert!(terminal_connection_state(true, false, false));
        assert!(terminal_connection_state(false, true, false));
        assert!(!terminal_connection_state(false, false, false));
    }

    #[test]
    fn retired_channel_waits_through_close_timeout_and_recovery() {
        use RetiredChannelPhase as Channel;
        use RetiredConnectionPhase as Connection;

        assert_eq!(
            retired_channel_action_for(Connection::Connected, Channel::Closing),
            RetiredChannelAction::Wait
        );
        assert_eq!(
            retired_channel_action_for(Connection::Recovering, Channel::Closing),
            RetiredChannelAction::Wait
        );
        assert_eq!(
            retired_channel_action_for(Connection::Recovering, Channel::Recovering),
            RetiredChannelAction::Wait
        );
        assert_eq!(
            retired_channel_action_for(Connection::Connected, Channel::Connected),
            RetiredChannelAction::Close
        );
        assert_eq!(
            retired_channel_action_for(Connection::Connected, Channel::Terminal),
            RetiredChannelAction::Stop
        );
        assert_eq!(
            retired_channel_action_for(Connection::Terminal, Channel::Connected),
            RetiredChannelAction::Stop
        );
    }

    #[tokio::test]
    async fn retired_cleanup_keeps_capacity_until_it_finishes() {
        let slots = Arc::new(Semaphore::new(1));
        let permit = Arc::clone(&slots)
            .try_acquire_owned()
            .expect("acquire only slot");
        let (release, released) = tokio::sync::oneshot::channel::<()>();
        let cleanup = tokio::spawn(run_retired_cleanup(
            async move {
                released.await.expect("release cleanup");
            },
            permit,
        ));

        assert!(Arc::clone(&slots).try_acquire_owned().is_err());
        release.send(()).expect("release cleanup");
        cleanup.await.expect("cleanup completed");
        assert!(Arc::clone(&slots).try_acquire_owned().is_ok());
    }

    #[tokio::test]
    async fn live_retired_channel_closes_and_nonconnected_status_waits() {
        let Some((connection, _topology_channel, _)) = live_broker().await else {
            return;
        };
        let rabbit = RabbitMQ::new(Arc::clone(&connection), None, 1);
        let pooled = rabbit
            .publisher_channel_pool
            .get()
            .await
            .expect("get confirmed publisher channel");
        let channel = Object::take(pooled);
        assert_eq!(rabbit.publisher_channel_pool.status().size, 0);
        assert_eq!(
            retired_channel_action(connection.status(), &channel),
            RetiredChannelAction::Close
        );
        assert_eq!(
            retired_channel_action(&ConnectionStatus::default(), &channel),
            RetiredChannelAction::Wait
        );

        let observed = channel.clone();
        tokio::time::timeout(
            RETIRED_CHANNEL_CLOSE_TIMEOUT,
            close_retired_channel(channel, connection.status().clone()),
        )
        .await
        .expect("retired channel cleanup must complete");
        assert!(!observed.status().connected());
        assert_eq!(
            retired_channel_action(connection.status(), &observed),
            RetiredChannelAction::Stop
        );
        assert!(
            rabbit
                .publisher_channel_pool
                .get()
                .await
                .expect("create replacement publisher channel")
                .status()
                .connected()
        );
    }

    #[tokio::test]
    async fn live_cancelled_close_keeps_channel_until_close_completes() {
        let Some((connection, channel, _)) = live_broker().await else {
            return;
        };

        // Poll once to send Channel.Close and enter Closing. Dropping the
        // pending future models the cleanup deadline firing before Close-Ok.
        let mut close = Box::pin(channel.close(200, "OK".into()));
        assert!(matches!(
            futures_util::poll!(close.as_mut()),
            std::task::Poll::Pending
        ));
        assert!(channel.status().closing());
        assert!(!channel.status().reconnecting());
        drop(close);

        assert_eq!(
            retired_channel_action(connection.status(), &channel),
            RetiredChannelAction::Wait
        );
        assert_eq!(
            retired_channel_action(&ConnectionStatus::default(), &channel),
            RetiredChannelAction::Wait
        );

        tokio::time::timeout(RETIRED_CHANNEL_CLOSE_TIMEOUT, async {
            while retired_channel_action(connection.status(), &channel)
                != RetiredChannelAction::Stop
            {
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .expect("broker should finish the pending channel close");
        assert!(connection.status().connected());
        assert!(!channel.status().connected());
    }

    #[tokio::test]
    async fn live_cancelled_publish_attempt_cannot_reuse_its_channel() {
        let Some((connection, _topology_channel, _)) = live_broker().await else {
            return;
        };
        let rabbit = RabbitMQ::new(Arc::clone(&connection), None, 1);
        let pooled = rabbit
            .publisher_channel_pool
            .get()
            .await
            .expect("get confirmed publisher channel");
        let observed = (*pooled).clone();
        let guard = PublishChannelGuard::new(
            pooled,
            connection.status().clone(),
            Arc::clone(&rabbit.publish_slots)
                .try_acquire_owned()
                .expect("publisher slot"),
        );
        let (started, polled) = tokio::sync::oneshot::channel();

        // Model cancellation while an attempt awaits a broker confirmation.
        // The guard must be dropped by the task, not by a successful result.
        let pending = tokio::spawn(async move {
            let _guard = guard;
            started.send(()).expect("signal pending attempt");
            std::future::pending::<()>().await;
        });
        polled.await.expect("attempt has started");
        pending.abort();
        assert!(
            pending
                .await
                .expect_err("attempt must be cancelled")
                .is_cancelled()
        );

        assert_eq!(rabbit.publisher_channel_pool.status().size, 0);
        let replacement = rabbit
            .publisher_channel_pool
            .get()
            .await
            .expect("get replacement publisher channel");
        assert!(replacement.status().connected());
        tokio::time::timeout(RETIRED_CHANNEL_CLOSE_TIMEOUT, async {
            while observed.status().connected() {
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .expect("cancelled channel must be closed");
        tokio::time::timeout(RETIRED_CHANNEL_CLOSE_TIMEOUT, async {
            while rabbit.publish_slots.available_permits() == 0 {
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .expect("cleanup must release publisher slot");
    }

    #[tokio::test]
    async fn live_abandoned_setup_channel_is_retired() {
        let Some((connection, channel, _)) = live_broker().await else {
            return;
        };
        let observed = channel.clone();
        let setup_slots = Arc::new(Semaphore::new(1));
        drop(ChannelSetupGuard::new(
            channel,
            connection.status().clone(),
            Arc::clone(&setup_slots)
                .try_acquire_owned()
                .expect("setup slot"),
        ));

        tokio::time::timeout(RETIRED_CHANNEL_CLOSE_TIMEOUT, async {
            while observed.status().connected() {
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .expect("abandoned setup channel must be closed");
        tokio::time::timeout(RETIRED_CHANNEL_CLOSE_TIMEOUT, async {
            while setup_slots.available_permits() == 0 {
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .expect("cleanup must release setup slot");
    }

    #[tokio::test]
    async fn live_confirmed_publish_and_unroutable_return() {
        let Some((connection, channel, queue_name)) = live_broker().await else {
            return;
        };
        let rabbit = RabbitMQ::new(connection, None, 2);

        rabbit
            .publish(b"routable", "", &queue_name, None)
            .await
            .expect("routable message must be confirmed");
        assert_eq!(rabbit.publisher_channel_pool.status().size, 1);
        let delivery = channel
            .basic_get(queue_name.clone().into(), Default::default())
            .await
            .expect("get published message")
            .expect("confirmed message must reach queue");
        assert_eq!(delivery.data, b"routable");

        let absent_queue = format!("{queue_name}-absent");
        let error = rabbit
            .publish(b"unroutable", "", &absent_queue, None)
            .await
            .expect_err("mandatory returned publish must fail");
        assert!(error.to_string().contains("unroutable"), "{error}");
        assert_eq!(rabbit.publisher_channel_pool.status().size, 1);
    }

    #[tokio::test]
    async fn live_concurrent_publishes_all_reach_the_queue() {
        let Some((connection, channel, queue_name)) = live_broker().await else {
            return;
        };
        let rabbit = Arc::new(RabbitMQ::new(connection, None, 16));
        let payload = vec![42; 64 * 1024];
        let mut tasks = Vec::new();
        for _ in 0..16 {
            let rabbit = Arc::clone(&rabbit);
            let queue_name = queue_name.clone();
            let payload = payload.clone();
            tasks.push(tokio::spawn(async move {
                for _ in 0..16 {
                    rabbit.publish(&payload, "", &queue_name, None).await?;
                }
                anyhow::Ok(())
            }));
        }
        for task in tasks {
            task.await
                .expect("publisher task panicked")
                .expect("publish");
        }

        let queue = channel
            .queue_declare(
                queue_name.into(),
                QueueDeclareOptions {
                    passive: true,
                    ..Default::default()
                },
                FieldTable::default(),
            )
            .await
            .expect("inspect queue");
        assert_eq!(queue.message_count(), 256);
    }

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
}
