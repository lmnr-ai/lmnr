use std::time::Duration;

use anyhow::{Context, Result};
use rabbitmq_stream_client::{
    ClientOptions, Environment,
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
        // `from_client_option` instead of `Environment::builder()` because the
        // EnvironmentBuilder doesn't expose `max_frame_size`. The frame limit is
        // broker-owned (`stream.frame_max` in rabbitmq.conf): 0 here means
        // "defer to the server" in the tune negotiation (`negotiate_value`
        // takes the non-zero side), whereas the crate's 1 MiB default would
        // cap the negotiation regardless of broker config.
        let client_options = ClientOptions::builder()
            .host(&env::streams::HOST.get())
            .port(env::streams::PORT.get())
            .user(&env::streams::USERNAME.get())
            .password(&env::streams::PASSWORD.get())
            .v_host(&env::streams::VIRTUAL_HOST.get())
            .load_balancer_mode(env::streams::LOAD_BALANCER_MODE.get())
            .max_frame_size(0)
            .build();

        let inner = Environment::from_client_option(client_options)
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
                    "Created super stream '{}' with {} partitions, initial-cluster-size={} (max_length={}B, max_age={}s, segment={}B)",
                    super_stream,
                    self.partitions,
                    self.replication_factor,
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

    /// `max-length-bytes` is applied PER PARTITION, so the disk the defaults can
    /// occupy is the PRODUCT. At RF=3 every node holds every partition, so that
    /// product has to fit ONE node's free disk (~250 GB of the prod 400 GiB NVMe
    /// after the `disk_free_limit` floor and quorum-queue headroom). Retention is
    /// creation-only, so an oversized default is not fixable by a redeploy.
    #[test]
    fn default_retention_budget_fits_one_prod_node() {
        const USABLE_BYTES_PER_NODE: u64 = 250 * 1000 * 1000 * 1000;

        let topology = StreamTopology::from_env();
        let total = topology.max_length_bytes * topology.partitions as u64;

        assert!(
            total <= USABLE_BYTES_PER_NODE,
            "default retention budget is {} GiB ({} partitions x {} GiB), which exceeds one prod node's usable disk",
            total / 1024 / 1024 / 1024,
            topology.partitions,
            topology.max_length_bytes / 1024 / 1024 / 1024,
        );

        // Retention only ever drops whole CLOSED segments, so a segment that is a
        // large fraction of the per-partition cap makes expiry coarse.
        assert!(
            topology.max_segment_size_bytes * 10 <= topology.max_length_bytes,
            "segment size {} MB is too coarse against the {} MB per-partition cap",
            topology.max_segment_size_bytes / 1024 / 1024,
            topology.max_length_bytes / 1024 / 1024,
        );
    }
}
