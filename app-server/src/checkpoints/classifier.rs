//! LLM-based agent classification for checkpoints.

use std::{
    collections::{HashMap, HashSet},
    sync::Arc,
};

use serde_json::Value;
use uuid::Uuid;

use crate::{
    checkpoints::llm::{CheckpointRoot, run_llm},
    db::agents::AgentVersion,
    llm::{
        LlmClient, ModelSize, ProviderContent, ProviderFunctionDeclaration,
        ProviderGenerationConfig, ProviderPart, ProviderRequest, ProviderTool,
    },
};

/// Result of the LLM classification: is the incoming system prompt a brand-new
/// agent, or a modified version of an existing one?
#[derive(Debug, Clone)]
pub enum AgentClassification {
    /// No existing agent matches — create a new one. `name` is an
    /// LLM-generated display name for the new agent.
    NewAgent { name: String },
    /// A modified version of an existing agent.
    ExistingAgent { agent_id: Uuid },
}

const CLASSIFY_TOOL_NAME: &str = "classify_agent";

#[derive(Debug, thiserror::Error)]
enum ClassifyError {
    #[error("classify_agent transport failure: {0}")]
    Transport(anyhow::Error),
    #[error("classify_agent rejected: {0}")]
    Rejected(anyhow::Error),
}

const CLASSIFY_INSTRUCTION: &str = "You classify AI agent system prompts. Given an incoming agent's system prompt and a list of \
     existing agents (each with an id and one or more known versions of its system prompt, since \
     several versions of one agent can run at the same time), decide whether the incoming prompt is \
     a completely new agent or another version of one of the existing agents. Matching ANY ONE of an \
     agent's listed versions means the incoming prompt belongs to that agent.\n\n\
     Base your decision ONLY on the agent's specific ROLE and PURPOSE — the sentence(s) describing \
     who the agent is and what job it does (e.g. 'senior research analyst gathering data' vs \
     'portfolio manager orchestrating subagents'). IGNORE shared boilerplate that appears in most \
     prompts and carries no role information: billing/header lines, 'You are a Claude agent built \
     on Anthropic's Claude Agent SDK', environment/<env> blocks, git status, OS/shell/model/version \
     details, and generic formatting or tool-use conventions. Two prompts that differ ONLY in such \
     boilerplate are the SAME agent; two prompts with the same boilerplate but a different role are \
     DIFFERENT agents.\n\n\
     Do not be misled by surface word overlap or shared domain vocabulary. An agent that PERFORMS a \
     task is a DIFFERENT agent from one that ORCHESTRATES or DELEGATES that task, even if both \
     mention the same domain (e.g. a 'research analyst' that does the research is not the same as a \
     'portfolio manager' that delegates research to subagents). When the core role or purpose is \
     unrelated, classify as a new agent. Respond ONLY by calling the classify_agent tool.";

const INCOMING_PROMPT_LIMIT: usize = 4000;
/// Per-version budget when the whole set fits comfortably. Shrinks toward
/// [`MIN_EXISTING_PROMPT_CHARS`] as the version count grows — see
/// [`existing_prompt_budget`].
const EXISTING_PROMPT_LIMIT: usize = 1000;

/// Floor on a listed version's prompt. Below this a prompt stops carrying enough
/// of its role statement to classify against, so we drop versions instead of
/// shrinking further.
const MIN_EXISTING_PROMPT_CHARS: usize = 200;

/// Char budget for the "existing agents" block. A project's agent count is
/// unbounded, so without this the request grows with it until the provider
/// rejects it — and a rejection is a transport error, which falls back to
/// "most recently created agent" and silently misattributes the checkpoint.
/// Bounding the prompt keeps the classification honest instead. Roughly 30k
/// tokens at ~4 chars/token, well inside every provider's input window.
const EXISTING_CONTEXT_CHAR_BUDGET: usize = 120_000;

/// Per-version char allotment that keeps `version_count` versions inside
/// [`EXISTING_CONTEXT_CHAR_BUDGET`], clamped to the floor.
fn existing_prompt_budget(version_count: usize) -> usize {
    if version_count == 0 {
        return EXISTING_PROMPT_LIMIT;
    }
    (EXISTING_CONTEXT_CHAR_BUDGET / version_count)
        .clamp(MIN_EXISTING_PROMPT_CHARS, EXISTING_PROMPT_LIMIT)
}

/// How many versions fit at the floor, and so the maximum number of agents that
/// can be listed. Past this the block is truncated: extra versions go first, and
/// only once the AGENT count alone exceeds this are agents excluded — by lowest
/// relevance to the incoming prompt, with a warning, since that's the one case
/// where classification can mint a duplicate.
const MAX_LISTED_VERSIONS: usize = EXISTING_CONTEXT_CHAR_BUDGET / MIN_EXISTING_PROMPT_CHARS;

/// Decide whether `non_dynamic_system_prompt` is a new agent or another version
/// of an existing one. `existing_versions` carries every agent's newest version
/// plus a budget of older-but-live ones (newest-per-agent first), not just each
/// agent's latest — see [`crate::db::agents::list_recent_agent_versions`]. The
/// rendered request is size-bounded in `build_context`, since a project's agent
/// count itself is unbounded.
///
/// With no LLM provider, or on a transport failure, falls back to the most
/// recently created version's agent (`fallback_classification`, which errors
/// rather than mint a nameless agent). That fallback is a coarse guess, which is
/// why the request must stay inside the provider's input window instead of
/// relying on it. A rejected verdict (e.g. new agent with no name) is NOT
/// eligible for fallback and propagates so the checkpoint is dropped.
pub async fn classify_agent(
    non_dynamic_system_prompt: &str,
    existing_versions: &[AgentVersion],
    llm_client: Option<Arc<LlmClient>>,
    root: &CheckpointRoot,
) -> anyhow::Result<AgentClassification> {
    let Some(llm_client) = llm_client else {
        return fallback_classification(existing_versions);
    };

    match classify_with_llm(
        &llm_client,
        non_dynamic_system_prompt,
        existing_versions,
        root,
    )
    .await
    {
        Ok(classification) => Ok(classification),
        Err(ClassifyError::Transport(e)) => {
            log::warn!("[CHECKPOINTS] Agent classification failed, falling back: {e:?}");
            fallback_classification(existing_versions)
        }
        Err(ClassifyError::Rejected(e)) => {
            log::warn!("[CHECKPOINTS] Agent classification rejected, dropping checkpoint: {e:?}");
            Err(e)
        }
    }
}

async fn classify_with_llm(
    llm_client: &LlmClient,
    system_prompt: &str,
    existing_versions: &[AgentVersion],
    root: &CheckpointRoot,
) -> Result<AgentClassification, ClassifyError> {
    let request = ProviderRequest {
        contents: vec![ProviderContent {
            role: Some("user".to_string()),
            parts: Some(vec![ProviderPart {
                text: Some(build_context(system_prompt, existing_versions)),
                ..Default::default()
            }]),
        }],
        system_instruction: Some(ProviderContent {
            role: None,
            parts: Some(vec![ProviderPart {
                text: Some(CLASSIFY_INSTRUCTION.to_string()),
                ..Default::default()
            }]),
        }),
        tools: Some(vec![build_classify_tool()]),
        generation_config: Some(ProviderGenerationConfig {
            temperature: Some(0.0),
            ..Default::default()
        }),
        service_tier: None,
        provider: None,
        model_size: Some(ModelSize::Small),
    };

    let response = run_llm(
        root,
        llm_client,
        &request,
        || tracing::info_span!(target: "lmnr::internal", "classify_agent"),
    )
    .await
    .map_err(|e| {
        ClassifyError::Transport(anyhow::anyhow!("classify_agent LLM call failed: {e:?}"))
    })?;

    let args = response
        .candidates
        .and_then(|c| c.into_iter().next())
        .and_then(|c| c.content)
        .and_then(|content| content.parts)
        .and_then(|parts| {
            parts.into_iter().find_map(|p| {
                p.function_call
                    .filter(|fc| fc.name == CLASSIFY_TOOL_NAME)
                    .and_then(|fc| fc.args)
            })
        });

    match args {
        // An invalid verdict is a rejection (drop), not a transport failure.
        Some(args) => {
            parse_classification(&args, existing_versions).map_err(ClassifyError::Rejected)
        }
        // No tool call: nothing usable, let the caller fall back.
        None => Err(ClassifyError::Transport(anyhow::anyhow!(
            "classify_agent returned no tool call"
        ))),
    }
}

/// Map the tool-call arguments to a classification. An "existing" verdict only
/// holds when the model returns a known agent id; a "new" verdict requires a
/// non-empty name — an omitted/blank name is an error rather than a nameless
/// agent, so the checkpoint is dropped (and re-triggered later) instead.
fn parse_classification(
    args: &Value,
    existing_versions: &[AgentVersion],
) -> anyhow::Result<AgentClassification> {
    let is_new = args
        .get("is_new_agent")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);

    if !is_new {
        if let Some(agent_id) = args
            .get("agent_id")
            .and_then(|v| v.as_str())
            .and_then(|s| Uuid::parse_str(s).ok())
        {
            if existing_versions.iter().any(|v| v.agent_id == agent_id) {
                return Ok(AgentClassification::ExistingAgent { agent_id });
            }
        }
    }

    let name = args
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .trim()
        .to_string();
    if name.is_empty() {
        anyhow::bail!("classify_agent returned a new agent with no name");
    }
    Ok(AgentClassification::NewAgent { name })
}

fn fallback_classification(
    existing_versions: &[AgentVersion],
) -> anyhow::Result<AgentClassification> {
    match existing_versions.iter().max_by_key(|v| v.created_at) {
        None => anyhow::bail!(
            "cannot classify a new agent without an LLM provider (no existing agents to attribute to)"
        ),
        Some(version) => Ok(AgentClassification::ExistingAgent {
            agent_id: version.agent_id,
        }),
    }
}

/// Render the incoming prompt plus the existing versions, grouped under their
/// agent. Versions of one agent are listed together so the model sees that
/// concurrently-live variants (A/B tests, subversions) belong to the same agent
/// instead of treating each as an unrelated candidate. Versions whose prompt is
/// identical after truncation collapse into one entry — they'd differ only in
/// tools/model, which classification ignores.
///
/// The rendered block is bounded by [`EXISTING_CONTEXT_CHAR_BUDGET`], and the
/// budget is spent in a fixed priority order, because a missing agent is what
/// causes a duplicate agent while a shorter prompt usually still carries the role
/// statement classification keys on:
///  1. every agent's newest version (all of them, when the agent count fits),
///  2. older versions, rank-major, filling whatever room is left,
///  3. per-version prompt detail, shrunk via [`existing_prompt_budget`].
///
/// Only when a project has more than [`MAX_LISTED_VERSIONS`] agents — so not even
/// one version each fits — are agents excluded, and then by lowest word overlap
/// with the incoming prompt rather than by age, so the likely match survives.
fn build_context(system_prompt: &str, existing_versions: &[AgentVersion]) -> String {
    let mut ctx = format!(
        "Incoming agent system prompt:\n{}\n\nExisting agents in this project:\n",
        crate::utils::truncate_chars(system_prompt, INCOMING_PROMPT_LIMIT)
    );
    if existing_versions.is_empty() {
        ctx.push_str("(none)\n");
        return ctx;
    }

    // Group by agent, preserving the caller's newest-per-agent-first order so
    // each agent's versions stay newest-first.
    let mut order: Vec<Uuid> = Vec::new();
    let mut versions_by_agent: HashMap<Uuid, Vec<&str>> = HashMap::new();
    for version in existing_versions {
        let prompts = versions_by_agent
            .entry(version.agent_id)
            .or_insert_with(|| {
                order.push(version.agent_id);
                Vec::new()
            });
        prompts.push(version.system_prompt.as_str());
    }

    // Past the cap something must go. Dropping the tail by recency would omit
    // whole agents once the agent count alone exceeds the cap, and an omitted
    // agent is exactly what gets re-minted as a duplicate. So when the project is
    // that large, keep the agents whose prompts most resemble the incoming one —
    // the real match is overwhelmingly likely to be among them, whereas recency
    // says nothing about relevance.
    if order.len() > MAX_LISTED_VERSIONS {
        let needle = word_set(system_prompt);
        let mut scored: Vec<(usize, Uuid)> = order
            .iter()
            .map(|id| {
                let best = versions_by_agent[id]
                    .iter()
                    .map(|p| overlap_score(&needle, p))
                    .max()
                    .unwrap_or(0);
                (best, *id)
            })
            .collect();
        // Descending by score; ties keep the newer agent (stable sort on the
        // already newest-first order).
        scored.sort_by(|a, b| b.0.cmp(&a.0));
        let kept: HashSet<Uuid> = scored
            .iter()
            .take(MAX_LISTED_VERSIONS)
            .map(|(_, id)| *id)
            .collect();
        log::warn!(
            "[CHECKPOINTS] {} agents exceed the classification context cap; comparing against the \
             {MAX_LISTED_VERSIONS} most similar to the incoming prompt. Shapes belonging to an \
             excluded agent can be minted as duplicates.",
            order.len()
        );
        order.retain(|id| kept.contains(id));
        versions_by_agent.retain(|id, _| kept.contains(id));
    }

    // Every listed agent keeps its newest version; extras fill the remaining
    // budget rank-major, so no single agent's history crowds out another agent's
    // variants.
    let mut per_agent_keep: HashMap<Uuid, usize> = order.iter().map(|id| (*id, 1usize)).collect();
    let mut listed: usize = order.len();
    let mut rank = 1usize;
    while listed < MAX_LISTED_VERSIONS {
        let mut added = false;
        for id in &order {
            if listed >= MAX_LISTED_VERSIONS {
                break;
            }
            if versions_by_agent[id].len() > rank {
                *per_agent_keep.get_mut(id).unwrap() += 1;
                listed += 1;
                added = true;
            }
        }
        if !added {
            break;
        }
        rank += 1;
    }

    let per_version = existing_prompt_budget(listed);
    for agent_id in &order {
        ctx.push_str(&format!("\n[agent_id={agent_id}]\n"));
        // Truncation can make two versions identical; they'd differ only in
        // tools/model, which classification ignores, so collapse them.
        let mut prompts: Vec<String> = Vec::new();
        for prompt in versions_by_agent[agent_id]
            .iter()
            .take(per_agent_keep[agent_id])
        {
            let prompt = crate::utils::truncate_chars(prompt, per_version);
            if !prompts.contains(&prompt) {
                prompts.push(prompt);
            }
        }
        for (i, prompt) in prompts.iter().enumerate() {
            if prompts.len() > 1 {
                ctx.push_str(&format!("(version {} of {})\n", i + 1, prompts.len()));
            }
            ctx.push_str(prompt);
            ctx.push('\n');
        }
    }
    ctx
}

/// Lowercased alphanumeric words of length >= 4, deduplicated. Short tokens are
/// dropped because they're dominated by boilerplate glue ("the", "you", "and")
/// that every system prompt shares and which therefore carries no signal.
fn word_set(text: &str) -> HashSet<String> {
    text.split(|c: char| !c.is_alphanumeric())
        .filter(|w| w.len() >= 4)
        .map(|w| w.to_lowercase())
        .collect()
}

/// Count of `needle` words present in `text` — a cheap relevance proxy used ONLY
/// to choose which agents to show the model when a project has more agents than
/// fit. It never decides the classification itself, so a crude score is fine.
fn overlap_score(needle: &HashSet<String>, text: &str) -> usize {
    let candidate = word_set(text);
    needle.iter().filter(|w| candidate.contains(*w)).count()
}

fn build_classify_tool() -> ProviderTool {
    ProviderTool {
        function_declarations: vec![ProviderFunctionDeclaration {
            name: CLASSIFY_TOOL_NAME.to_string(),
            description: "REQUIRED: report whether the incoming system prompt is a new agent or a \
                variant of an existing one. Always call this tool; never respond with plain text."
                .to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "is_new_agent": {
                        "type": "boolean",
                        "description": "true if the incoming prompt is a completely different agent (different role/purpose) than every existing agent; false if it is a variant or modified version of one of them."
                    },
                    "agent_id": {
                        "type": "string",
                        "description": "When is_new_agent is false, the id of the existing agent this prompt is a variant of. Must be exactly one of the provided existing agent ids."
                    },
                    "name": {
                        "type": "string",
                        "description": "When is_new_agent is true, a short human-readable name (2-4 words) describing the new agent's role."
                    }
                },
                "required": ["is_new_agent"]
            }),
        }],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_project_no_llm_errors_instead_of_blank_agent() {
        assert!(fallback_classification(&[]).is_err());
    }

    #[test]
    fn new_agent_with_blank_name_is_error() {
        let args = serde_json::json!({ "is_new_agent": true, "name": "  " });
        assert!(parse_classification(&args, &[]).is_err());
    }

    #[test]
    fn new_agent_with_missing_name_is_error() {
        let args = serde_json::json!({ "is_new_agent": true });
        assert!(parse_classification(&args, &[]).is_err());
    }

    fn version(agent_id: Uuid, system_prompt: &str) -> AgentVersion {
        AgentVersion {
            project_id: Uuid::nil(),
            agent_id,
            version_hash: system_prompt.to_string(),
            system_prompt: system_prompt.to_string(),
            tool_definitions: String::new(),
            model: "model".to_string(),
            created_at: chrono::Utc::now(),
        }
    }

    /// Versions are shed before agents: more versions than the cap still leaves
    /// every agent present via its newest version.
    #[test]
    fn truncation_sheds_versions_before_agents() {
        let ids: Vec<Uuid> = (0..400).map(|_| Uuid::new_v4()).collect();
        let mut many_versions = Vec::new();
        for rank in 0..3 {
            for (i, id) in ids.iter().enumerate() {
                many_versions.push(version(*id, &format!("agent {i} v{rank}")));
            }
        }
        assert!(many_versions.len() > MAX_LISTED_VERSIONS);
        let ctx = build_context("incoming", &many_versions);
        for id in &ids {
            assert!(
                ctx.contains(&format!("[agent_id={id}]")),
                "agent {id} dropped"
            );
        }
    }

    /// Past the agent cap something must be excluded — but the agent the incoming
    /// prompt actually belongs to must survive, or it gets minted as a duplicate.
    /// This is the case a recency-ordered truncation got wrong.
    #[test]
    fn over_agent_cap_keeps_the_relevant_agent() {
        let target = Uuid::new_v4();
        let mut versions = vec![version(
            target,
            "senior portfolio manager orchestrating subagent research delegation",
        )];
        // Far more unrelated agents than the cap, all ahead of the target in list
        // order, so a pure recency truncation would evict it.
        for i in 0..(MAX_LISTED_VERSIONS + 200) {
            versions.insert(
                0,
                version(
                    Uuid::new_v4(),
                    &format!("unrelated cooking recipe generator number {i}"),
                ),
            );
        }
        assert!(versions.len() > MAX_LISTED_VERSIONS);

        let ctx = build_context(
            "senior portfolio manager orchestrating subagent research delegation",
            &versions,
        );
        assert!(
            ctx.contains(&format!("[agent_id={target}]")),
            "the matching agent was excluded — it would be duplicated"
        );
        assert!(ctx.matches("[agent_id=").count() <= MAX_LISTED_VERSIONS);
    }

    #[test]
    fn overlap_score_ranks_similar_prompts_higher() {
        let needle = word_set("portfolio manager orchestrating subagent research");
        let similar = overlap_score(&needle, "portfolio manager orchestrating research tasks");
        let unrelated = overlap_score(&needle, "cooking recipe generator for desserts");
        assert!(
            similar > unrelated,
            "similar={similar} unrelated={unrelated}"
        );
    }

    #[test]
    fn context_groups_concurrent_versions_under_one_agent() {
        let a = Uuid::new_v4();
        let b = Uuid::new_v4();
        let ctx = build_context(
            "incoming",
            &[
                version(a, "researcher v2"),
                version(b, "planner"),
                version(a, "researcher v1"),
            ],
        );

        // Both of agent A's live versions are listed once, under a single id.
        assert_eq!(ctx.matches(&format!("[agent_id={a}]")).count(), 1);
        assert!(ctx.contains("researcher v2"));
        assert!(ctx.contains("researcher v1"));
        assert!(ctx.contains("(version 1 of 2)"));
        // A single-version agent gets no version labels.
        assert_eq!(ctx.matches("(version 1 of 1)").count(), 0);
        assert!(ctx.contains(&format!("[agent_id={b}]")));
    }

    #[test]
    fn context_collapses_duplicate_prompts_of_one_agent() {
        let a = Uuid::new_v4();
        let ctx = build_context("incoming", &[version(a, "same"), version(a, "same")]);
        assert_eq!(ctx.matches("same").count(), 1);
        assert_eq!(ctx.matches("(version").count(), 0);
    }

    /// A large project must not grow the request without bound — that's what
    /// gets the provider to reject it and silently trip the fallback.
    #[test]
    fn context_stays_within_budget_for_many_agents() {
        for agent_count in [1usize, 50, 500, 5_000] {
            let versions: Vec<AgentVersion> = (0..agent_count)
                .map(|i| version(Uuid::new_v4(), &"x".repeat(4_000 + i % 7)))
                .collect();
            let ctx = build_context("incoming", &versions);
            // Budget covers prompt text; headings/labels add a bounded overhead
            // per listed version, so allow a modest margin over the raw budget.
            let ceiling = EXISTING_CONTEXT_CHAR_BUDGET
                + INCOMING_PROMPT_LIMIT
                + 200 * MAX_LISTED_VERSIONS.min(agent_count)
                + 1_000;
            assert!(
                ctx.chars().count() <= ceiling,
                "{agent_count} agents produced {} chars, over ceiling {ceiling}",
                ctx.chars().count()
            );
        }
    }

    /// Every agent stays represented well past the point where a fixed
    /// per-version budget would have blown the context.
    #[test]
    fn context_keeps_every_agent_when_budget_shrinks() {
        let ids: Vec<Uuid> = (0..400).map(|_| Uuid::new_v4()).collect();
        let versions: Vec<AgentVersion> = ids
            .iter()
            .map(|id| version(*id, &"role statement ".repeat(200)))
            .collect();
        let ctx = build_context("incoming", &versions);
        for id in &ids {
            assert!(
                ctx.contains(&format!("[agent_id={id}]")),
                "agent {id} dropped"
            );
        }
    }

    #[test]
    fn per_version_budget_shrinks_but_never_below_floor() {
        assert_eq!(existing_prompt_budget(0), EXISTING_PROMPT_LIMIT);
        assert_eq!(existing_prompt_budget(1), EXISTING_PROMPT_LIMIT);
        // Shrinks once the set no longer fits at the full allotment.
        assert!(existing_prompt_budget(1_000) < EXISTING_PROMPT_LIMIT);
        assert!(existing_prompt_budget(1_000) >= MIN_EXISTING_PROMPT_CHARS);
        // Never below the floor, however large the project.
        assert_eq!(
            existing_prompt_budget(usize::MAX / 2),
            MIN_EXISTING_PROMPT_CHARS
        );
    }

    #[test]
    fn new_agent_with_valid_name_is_ok() {
        let args = serde_json::json!({ "is_new_agent": true, "name": "Portfolio Manager" });
        match parse_classification(&args, &[]).unwrap() {
            AgentClassification::NewAgent { name } => assert_eq!(name, "Portfolio Manager"),
            _ => panic!("expected NewAgent"),
        }
    }
}
