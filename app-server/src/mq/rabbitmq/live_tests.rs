//! Drops every broker-side connection AND deletes the queue, then checks that
//! both connections are replaced, the topology is redeclared on the new
//! publisher connection, the binding is redone on the new consumer one, and
//! messages flow again. Run with `--ignored` against a broker at
//! `RABBITMQ_TEST_URL` (default `amqp://guest:guest@localhost:5672/%2f`),
//! with `rabbitmqctl` on `PATH` or at `RABBITMQCTL`.

use std::process::Command;

use futures_util::future::BoxFuture;
use lapin::{
    ExchangeKind,
    options::{ExchangeDeclareOptions, QueueDeclareOptions},
    types::AMQPValue,
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
