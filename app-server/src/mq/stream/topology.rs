use std::time::Duration;

use anyhow::{Context, Result};
use rabbitmq_stream_client::{
    Environment,
    error::StreamCreateError,
    types::{ByteCapacity, ResponseCode},
};

use crate::env;

/// Shared connection factory for publishers and readers. Cheap to clone; the
/// client opens its own connections per producer/consumer underneath.
#[derive(Clone)]
pub struct StreamEnvironment {
    inner: Environment,
}

impl StreamEnvironment {
    pub async fn connect() -> Result<Self> {
        let inner = Environment::builder()
            .host(&env::streams::HOST.get())
            .port(env::streams::PORT.get())
            .username(&env::streams::USERNAME.get())
            .password(&env::streams::PASSWORD.get())
            .virtual_host(&env::streams::VIRTUAL_HOST.get())
            .load_balancer_mode(env::streams::LOAD_BALANCER_MODE.get())
            .build()
            .await
            .context("Failed to connect to the RabbitMQ stream endpoint")?;

        Ok(Self { inner })
    }

    pub fn inner(&self) -> &Environment {
        &self.inner
    }
}

/// Per-super-stream retention + partitioning, resolved once from env.
#[derive(Clone, Copy)]
pub struct StreamTopology {
    pub partitions: usize,
    pub max_length_bytes: u64,
    pub max_age: Duration,
    pub max_segment_size_bytes: u64,
    pub replication_factor: usize,
}

impl StreamTopology {
    pub fn from_env() -> Self {
        Self {
            partitions: env::streams::PARTITIONS.get().max(1),
            max_length_bytes: env::streams::MAX_LENGTH_BYTES.get(),
            max_age: Duration::from_secs(env::streams::MAX_AGE_SECS.get()),
            max_segment_size_bytes: env::streams::MAX_SEGMENT_SIZE_BYTES.get(),
            replication_factor: env::streams::REPLICATION_FACTOR.get().max(1),
        }
    }

    /// Declare a super stream idempotently. `StreamAlreadyExists` is the normal
    /// path on every boot after the first.
    ///
    /// Retention args only apply at CREATION — the broker ignores them for an
    /// existing stream, so changing `MAX_LENGTH_BYTES` needs a policy
    /// (`rabbitmqctl set_policy`), not a redeploy. Same for `partitions`, which
    /// additionally re-maps hash routing and so must never change in place.
    pub async fn declare(&self, environment: &StreamEnvironment, super_stream: &str) -> Result<()> {
        let mut creator = environment
            .inner()
            .stream_creator()
            .max_length(ByteCapacity::B(self.max_length_bytes))
            .max_age(self.max_age)
            .max_segment_size(ByteCapacity::B(self.max_segment_size_bytes));

        // The client exposes no typed setter for the replica count, and it is
        // creation-only, so it goes straight into the raw arg map.
        creator.options.insert(
            "initial-cluster-size".to_owned(),
            self.replication_factor.to_string(),
        );

        let result = creator
            .create_super_stream(super_stream, self.partitions, None)
            .await;

        match result {
            Ok(()) => {
                log::info!(
                    "Created super stream '{}' with {} partitions (max_length={}B, max_age={}s, segment={}B)",
                    super_stream,
                    self.partitions,
                    self.max_length_bytes,
                    self.max_age.as_secs(),
                    self.max_segment_size_bytes,
                );
                Ok(())
            }
            Err(StreamCreateError::Create {
                status: ResponseCode::StreamAlreadyExists,
                ..
            }) => {
                log::debug!("Super stream '{}' already exists", super_stream);
                Ok(())
            }
            Err(e) => Err(anyhow::Error::from(e)
                .context(format!("Failed to declare super stream '{}'", super_stream))),
        }
    }

    /// Declare a plain (non-partitioned) stream idempotently — the dead-letter
    /// sink. Not a super stream: it's low volume and nothing routes by key, so a
    /// single log is right and `create_super_stream` would be wrong.
    ///
    /// Retention comes from the same env knobs, which is generous for a poison
    /// sink but keeps one source of truth; a dedicated policy can shrink it.
    pub async fn declare_plain(&self, environment: &StreamEnvironment, stream: &str) -> Result<()> {
        let result = environment
            .inner()
            .stream_creator()
            .max_length(ByteCapacity::B(self.max_length_bytes))
            .max_age(self.max_age)
            .max_segment_size(ByteCapacity::B(self.max_segment_size_bytes))
            .create(stream)
            .await;

        match result {
            Ok(()) => {
                log::info!("Created stream '{}'", stream);
                Ok(())
            }
            Err(StreamCreateError::Create {
                status: ResponseCode::StreamAlreadyExists,
                ..
            }) => {
                log::debug!("Stream '{}' already exists", stream);
                Ok(())
            }
            Err(e) => {
                Err(anyhow::Error::from(e)
                    .context(format!("Failed to declare stream '{}'", stream)))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn connect_to_dead_endpoint_errors_rather_than_panicking() {
        // main()'s streams block relies on this: a failed connect must leave the
        // publishers unset so ingest degrades to the quorum queue.
        unsafe {
            std::env::set_var("RABBITMQ_STREAM_HOST", "127.0.0.1");
            // Port 1 is reserved and never listening.
            std::env::set_var("RABBITMQ_STREAM_PORT", "1");
        }

        let result = StreamEnvironment::connect().await;
        assert!(result.is_err(), "expected connect to a dead port to fail");

        unsafe {
            std::env::remove_var("RABBITMQ_STREAM_HOST");
            std::env::remove_var("RABBITMQ_STREAM_PORT");
        }
    }

    #[test]
    fn topology_clamps_degenerate_values() {
        unsafe {
            std::env::set_var("RABBITMQ_STREAM_PARTITIONS", "0");
            std::env::set_var("RABBITMQ_STREAM_REPLICATION_FACTOR", "0");
        }
        let topology = StreamTopology::from_env();
        // A 0-partition super stream would make the routing modulo panic.
        assert_eq!(topology.partitions, 1);
        assert_eq!(topology.replication_factor, 1);
        unsafe {
            std::env::remove_var("RABBITMQ_STREAM_PARTITIONS");
            std::env::remove_var("RABBITMQ_STREAM_REPLICATION_FACTOR");
        }
    }
}
