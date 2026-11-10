//! AMQP message properties: persistence, TTL, priority, and the retry-attempt
//! header that carries a delayed retry's budget across the park round trip.

use lapin::{
    BasicProperties,
    types::{AMQPValue, FieldTable, ShortString},
};

/// Carries the delayed-retry count across a retry-queue round trip. RabbitMQ
/// preserves headers through dead-lettering, so the value survives the hop back
/// into the origin queue.
const RETRY_ATTEMPT_HEADER: &str = "x-lmnr-retry-attempt";

/// Properties common to every publish: `delivery_mode=2` is persistent, and the
/// TTL and priority are applied only when the caller asked for them — an absent
/// priority is what lets a quorum queue apply its own default (4).
pub(super) fn properties(ttl_ms: Option<u64>, priority: Option<u8>) -> BasicProperties {
    let mut properties = BasicProperties::default().with_delivery_mode(2);

    if let Some(ttl_ms) = ttl_ms {
        properties = properties.with_expiration(ShortString::from(ttl_ms.to_string()));
    }
    if let Some(priority) = priority {
        properties = properties.with_priority(priority);
    }

    properties
}

pub(super) fn retry_properties(ttl_ms: u64, attempt: u32, priority: Option<u8>) -> BasicProperties {
    let mut headers = FieldTable::default();
    headers.insert(RETRY_ATTEMPT_HEADER.into(), AMQPValue::LongUInt(attempt));

    properties(Some(ttl_ms), priority).with_headers(headers)
}

/// Anything but the `LongUInt` written by `retry_properties` reads as a first
/// delivery, which restarts the budget rather than dropping the message early.
pub(super) fn retry_attempt_of(properties: &BasicProperties) -> u32 {
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
}
