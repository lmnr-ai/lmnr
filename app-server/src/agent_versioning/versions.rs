//! Shared by both paths once a version is decided: its text, and the
//! `traces_agg` tags of its traces.

use std::collections::HashSet;

use anyhow::Result;
use serde_json::Value;
use uuid::Uuid;

use super::{Job, naming::system_message, normalize::core_text};
use crate::{
    ch::{
        ClickhouseTrait,
        agent_prompts::{TracePrompt, fetch_agent_doc},
        cloud::CloudClickhouse,
        traces_agg::{CHTraceAgentVersion, CHTraceAgg, trace_start_times},
    },
    db::agent_versioning::{VersionText, insert_models},
    traces::sp_versioning::tool_text,
};

impl Job {
    /// The example's system prompt, and the version's text: the example's
    /// system prompt and tool lines that are in the core, in document order.
    pub(super) async fn version_text(
        &self,
        project_id: Uuid,
        example: &TracePrompt,
        core: &[u64],
    ) -> Result<(Option<String>, VersionText)> {
        let doc = fetch_agent_doc(
            &self.clickhouse,
            project_id,
            example.trace_id,
            example.span_id,
        )
        .await?;
        let Some((input, tools)) = doc else {
            return Ok(Default::default());
        };
        let system_prompt = system_message(&input);
        let tool_text = serde_json::from_str::<Vec<Value>>(&tools)
            .map(|tools| tool_text::render(&tools))
            .unwrap_or_default();
        let text = VersionText {
            system_prompt: core_text(&system_prompt, core),
            tool_definitions: core_text(&tool_text, core),
        };
        Ok((Some(system_prompt), text))
    }

    pub(super) async fn write_labels(
        &self,
        project_id: Uuid,
        agent_hash: &str,
        labels: &[(Option<usize>, TracePrompt)],
        ids: &[Uuid],
        hashes: &[String],
    ) -> Result<()> {
        let trace_ids: Vec<Uuid> = labels
            .iter()
            .filter(|(version, _)| version.is_some())
            .map(|(_, trace)| trace.trace_id)
            .collect();
        // `trace.time` is the trace's first agent span, not its start, and
        // `start_time` is the partition key; it is only the fallback.
        let starts = trace_start_times(&self.clickhouse, project_id, &trace_ids).await?;
        let mut rows = Vec::new();
        let mut models = HashSet::new();
        for (version, trace) in labels {
            let Some(version) = *version else { continue };
            let start = starts.get(&trace.trace_id).copied().unwrap_or(trace.time);
            let mut row = CHTraceAgg::zero_sum_partial(project_id, trace.trace_id, start);
            let tag = |model: &str| CHTraceAgentVersion {
                agent_hash: agent_hash.to_string(),
                version_hash: hashes[version].clone(),
                model: model.to_string(),
            };
            row.agent_versions = match trace.models.as_slice() {
                [] => vec![tag("")],
                trace_models => trace_models.iter().map(|m| tag(m)).collect(),
            };
            models.extend(trace.models.iter().map(|m| (ids[version], m.clone())));
            rows.push(row);
        }
        CloudClickhouse::new(self.clickhouse.clone())
            .insert_batch(&rows, None)
            .await?;
        let (version_ids, models): (Vec<Uuid>, Vec<String>) = models.into_iter().unzip();
        insert_models(&self.db.pool, project_id, &version_ids, &models).await
    }
}
