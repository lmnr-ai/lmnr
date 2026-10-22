//! Stores the agent calls published at ingestion in ClickHouse.

use std::{collections::HashSet, sync::Arc};

use async_trait::async_trait;

use super::producer::AgentCall;
use crate::{
    cache::{Cache, CacheTrait},
    ch::agent_versioning::{self, CHAgentCall, CHAgentLine},
    worker::{HandlerError, MessageHandler},
};

/// How long a stored document skips shipping its texts. Expiry only costs one
/// more copy of texts already stored.
const DOC_CACHE_TTL_SECONDS: u64 = 24 * 60 * 60;

pub struct AgentCallsHandler {
    pub cache: Arc<Cache>,
    pub clickhouse: clickhouse::Client,
}

#[async_trait]
impl MessageHandler for AgentCallsHandler {
    type Message = Vec<AgentCall>;

    async fn handle(&self, calls: Self::Message) -> Result<(), HandlerError> {
        let mut doc_keys = Vec::new();
        let mut lines = Vec::new();
        let mut seen = HashSet::new();
        for call in &calls {
            let Some(texts) = &call.lines else {
                continue;
            };
            doc_keys.push(call.doc_cache_key());
            for (hash, text) in call.line_hashes.iter().zip(texts) {
                if seen.insert((call.project_id, call.agent_hash.as_str(), *hash)) {
                    lines.push(CHAgentLine {
                        project_id: call.project_id,
                        agent_hash: call.agent_hash.clone(),
                        line_hash: *hash,
                        text: text.clone(),
                    });
                }
            }
        }
        let rows: Vec<CHAgentCall> = calls
            .into_iter()
            .map(|call| CHAgentCall {
                project_id: call.project_id,
                agent_hash: call.agent_hash,
                trace_id: call.trace_id,
                span_id: call.span_id,
                start_time: call.start_time.timestamp_micros(),
                line_hashes: call.line_hashes,
            })
            .collect();

        // Texts first: a call is only useful once its lines can be shown.
        agent_versioning::insert_lines(&self.clickhouse, &lines)
            .await
            .map_err(HandlerError::transient)?;
        agent_versioning::insert_calls(&self.clickhouse, &rows)
            .await
            .map_err(HandlerError::transient)?;

        for key in doc_keys {
            if let Err(e) = self
                .cache
                .insert_with_ttl(&key, "1", DOC_CACHE_TTL_SECONDS)
                .await
            {
                log::warn!("[AGENT_VERSIONING] Failed to mark document stored: {e:?}");
            }
        }
        Ok(())
    }
}
