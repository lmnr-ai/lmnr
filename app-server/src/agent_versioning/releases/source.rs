//! Where a release's prompt change came from. The frontend, which owns the
//! GitHub App, lists the code changes between the baseline release's commit
//! and this one's (`/api/internal/projects/{id}/github/release-changes`), and
//! an LLM judges the version diff against them: made by a pull request or
//! commit, real but not in the code, or sampling noise.

use anyhow::Result;
use reqwest::Method;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use similar::TextDiff;
use tracing::Instrument;
use uuid::Uuid;

use crate::{
    agent_versioning::{Job, internal_project_id},
    db::{agent_versioning::VersionText, github_integrations},
    instrumentation::spans::{self, InternalSpan, SpanType},
    llm::{
        LlmClient, LlmFeature, LlmRoute, ModelProvider, ProviderContent,
        ProviderFunctionDeclaration, ProviderGenerationConfig, ProviderPart, ProviderRequest,
        ProviderTool, request_to_span_input, request_to_tools_attr,
    },
    next_api,
    utils::truncate_chars,
};

const INTERNAL_TRACING_TARGET: &str = "lmnr::internal";
const MAX_OUTPUT_TOKENS: i32 = 16_000;
const MAX_PROMPT_DIFF_CHARS: usize = 40_000;
/// Patches past this many bytes are listed by file name only.
const MAX_CODE_BYTES: usize = 150_000;
const SUBMIT_TOOL: &str = "submit";
const MAX_TURNS: usize = 2;

const INSTRUCTIONS: &str = "\
You check a change Laminar detected in an AI agent's system prompt and tool definitions.

Laminar groups the agent's traces by release (the git commit that produced them) and compares \
a few sampled prompts of two releases. A difference between them is one of:
- a change made in the code between the two commits;
- a real change made outside the repository: a prompt kept in a database or prompt-management \
tool, tools served by a remote MCP server, a dependency's built-in prompt or tools;
- noise from sampling: content that varies from run to run, such as user or environment data, \
dates, ids, or optional sections and tools only some runs include, which the sampled runs \
happened to all include or all leave out.

You get the diff between the two versions' prompt text and the code changes between the two \
commits (pull requests, and commits pushed without one), with test, generated and lock files \
left out.

A code change is a source only when its own diff makes the prompt change: it adds, removes \
or edits that text or tool. Changing the same agent's code in other ways is not enough. A tool \
or section that disappears or appears with no diff removing or adding it was optional, and \
its absence is noise.

Call `submit` once:
- `verified` when code changes made the prompt change; list them in `sources` by their ids.
- `unverified` when the change looks real but no diff makes it.
- `noise` when every difference looks like run-to-run variation that no diff makes.
Give a `summary`: a short title of what changed in the agent, under 10 words, such as \
\"Cite the docs in every answer\" or \"Add a refund policy section\". It is shown as the \
version's title, so use plain text: no file paths, pull request numbers or markdown.";

/// The code changes between two releases' commits, from the frontend.
#[derive(Deserialize)]
struct ReleaseChanges {
    repo: String,
    changes: Vec<CodeChange>,
}

/// A pull request, or a commit pushed without one.
#[derive(Deserialize)]
struct CodeChange {
    title: String,
    url: String,
    /// The pull request's number; `None` for a commit.
    number: Option<u64>,
    files: Vec<ChangedFile>,
}

#[derive(Deserialize)]
struct ChangedFile {
    filename: String,
    patch: String,
}

/// `agent_versions.source`.
#[derive(Debug, PartialEq, Serialize)]
pub struct Source {
    pub status: SourceStatus,
    /// A short title of the change, shown as the version's title.
    pub summary: String,
    /// Oldest first, as the frontend lists them; the UI relies on the order.
    pub changes: Vec<SourceChange>,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SourceStatus {
    Verified,
    Unverified,
}

#[derive(Debug, PartialEq, Serialize)]
pub struct SourceChange {
    pub title: String,
    pub url: String,
    pub number: Option<u64>,
}

#[derive(Debug, PartialEq)]
pub enum Verdict {
    /// Sampling noise: the release keeps its baseline's version.
    Noise,
    Real(Source),
}

impl Verdict {
    pub fn source(self) -> Option<Source> {
        match self {
            Verdict::Noise => None,
            Verdict::Real(source) => Some(source),
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
enum Answer {
    Verified,
    Unverified,
    Noise,
}

#[derive(Deserialize)]
struct SubmitArgs {
    verdict: Answer,
    #[serde(default)]
    sources: Vec<usize>,
    #[serde(default)]
    summary: String,
}

impl Job {
    /// The verdict on the change from release `base` (version text `before`)
    /// to release `head` (`after`). `None` when it can't be checked: the
    /// project has no connected repo, none has both commits, or GitHub or the
    /// LLM failed.
    pub(super) async fn check_source(
        &self,
        project_id: Uuid,
        base: &str,
        head: &str,
        before: &VersionText,
        after: &VersionText,
    ) -> Option<Verdict> {
        let llm_client = self.llm_client.as_ref()?;
        let prompt_diff = prompt_diff(before, after);
        if prompt_diff.is_empty() {
            return None;
        }
        // Spares the frontend call for most projects, and OSS, where the route doesn't exist.
        match github_integrations::has_connected_repos(&self.db.pool, project_id).await {
            Ok(true) => {}
            Ok(false) => return None,
            Err(e) => {
                log::warn!("[AGENT VERSIONING] {project_id}: connected repos lookup failed: {e:?}");
                return None;
            }
        }
        let body = json!({ "base": base, "head": head });
        let changes = next_api::call::<Option<ReleaseChanges>>(
            &self.http_client,
            Method::POST,
            project_id,
            "github/release-changes",
            Some(body),
        )
        .await;
        let changes = match changes {
            Ok(changes) => changes?,
            Err(e) => {
                log::warn!("[AGENT VERSIONING] {project_id}: no code changes {base}..{head}: {e}");
                return None;
            }
        };
        let context = context(&prompt_diff, base, head, &changes);
        match judge(llm_client, project_id, context).await {
            Ok(answer) => Some(verdict(answer?, changes.changes)),
            Err(e) => {
                log::warn!("[AGENT VERSIONING] {project_id}: source check failed: {e:?}");
                None
            }
        }
    }
}

/// The unified diff of each part that changed.
fn prompt_diff(before: &VersionText, after: &VersionText) -> String {
    let parts = [
        ("System prompt", &before.system_prompt, &after.system_prompt),
        ("Tools", &before.tool_definitions, &after.tool_definitions),
    ];
    let diffs: Vec<String> = parts
        .into_iter()
        .filter(|(_, before, after)| before != after)
        .map(|(name, before, after)| {
            let diff = TextDiff::from_lines(before.as_str(), after.as_str())
                .unified_diff()
                .context_radius(3)
                .to_string();
            format!("### {name}\n{diff}")
        })
        .collect();
    truncate_chars(&diffs.join("\n"), MAX_PROMPT_DIFF_CHARS)
}

/// The model's input. Code changes are numbered from 1, the ids `sources` uses.
fn context(prompt_diff: &str, base: &str, head: &str, changes: &ReleaseChanges) -> String {
    let mut out = format!(
        "## Prompt change\n\n{prompt_diff}\n\n## Code changes in {} from {base} to {head}\n",
        changes.repo
    );
    if changes.changes.is_empty() {
        out.push_str("\nNone.\n");
    }
    let mut budget = MAX_CODE_BYTES;
    for (index, change) in changes.changes.iter().enumerate() {
        let kind = match change.number {
            Some(number) => format!("Pull request #{number}"),
            None => "Commit".to_string(),
        };
        out.push_str(&format!("\n### [{}] {kind}: {}\n", index + 1, change.title));
        for file in &change.files {
            match budget.checked_sub(file.patch.len()) {
                Some(left) => {
                    budget = left;
                    out.push_str(&format!("\n--- {}\n{}\n", file.filename, file.patch));
                }
                None => out.push_str(&format!("\n--- {} (diff omitted)\n", file.filename)),
            }
        }
    }
    out
}

/// The model's `submit` arguments; `None` when it never called `submit`. A
/// reply without the call is answered once with a reminder.
async fn judge(
    llm_client: &LlmClient,
    project_id: Uuid,
    context: String,
) -> Result<Option<SubmitArgs>> {
    let root = InternalSpan::wrap(
        tracing::info_span!(target: INTERNAL_TRACING_TARGET, parent: None, "agent.version_source"),
        SpanType::Default,
    )
    .project(internal_project_id())
    .metadata_str("project_id", &project_id.to_string())
    .input(&json!({ "context": context }))
    .build();
    let mut contents = vec![text_content(Some("user"), &context)];
    for step in 0..MAX_TURNS {
        let request = ProviderRequest {
            contents: contents.clone(),
            system_instruction: Some(text_content(None, INSTRUCTIONS)),
            tools: Some(vec![submit_tool()]),
            generation_config: Some(ProviderGenerationConfig {
                max_output_tokens: Some(MAX_OUTPUT_TOKENS),
                ..Default::default()
            }),
            service_tier: None,
            affinity_key: None,
            route: LlmRoute::feature(LlmFeature::AgentVersionSource, Some(project_id)),
        };
        let parts = generate(llm_client, &request, step)
            .instrument(root.clone())
            .await?;
        let submit = parts
            .iter()
            .filter_map(|part| part.function_call.as_ref())
            .find(|call| call.name == SUBMIT_TOOL);
        if let Some(call) = submit {
            let args = call.args.clone().unwrap_or(Value::Null);
            spans::set_output(&root, &args);
            return Ok(Some(serde_json::from_value(args)?));
        }
        contents.push(ProviderContent {
            role: Some("model".to_string()),
            parts: Some(parts),
        });
        contents.push(text_content(
            Some("user"),
            "Call `submit` with your verdict.",
        ));
    }
    Ok(None)
}

/// One model turn, traced as an LLM span under the current span.
async fn generate(
    llm_client: &LlmClient,
    request: &ProviderRequest,
    step: usize,
) -> Result<Vec<ProviderPart>> {
    let ModelProvider { model, provider } = llm_client.resolve_model_provider(request).await;
    let span = InternalSpan::wrap(
        tracing::info_span!(target: INTERNAL_TRACING_TARGET, "llm_call"),
        SpanType::LLM,
    )
    .project(internal_project_id())
    .input(&request_to_span_input(request))
    .tools(request_to_tools_attr(request).as_ref())
    .model(&provider, &model)
    .step(step)
    .build();
    let response = match llm_client
        .generate_content(request)
        .instrument(span.clone())
        .await
    {
        Ok(response) => response,
        Err(e) => {
            spans::record_error(&span, e.to_string());
            anyhow::bail!("LLM call failed: {e:?}");
        }
    };
    if let Some(usage) = &response.usage_metadata {
        spans::set_usage(
            &span,
            usage.prompt_token_count,
            usage.cache_read_input_tokens,
            usage.candidates_token_count,
        );
    }
    let parts = response
        .candidates
        .and_then(|candidates| candidates.into_iter().next())
        .and_then(|candidate| candidate.content)
        .and_then(|content| content.parts)
        .unwrap_or_default();
    spans::set_output(&span, &json!({ "role": "model", "parts": parts }));
    Ok(parts)
}

/// Sources must name listed changes; a `verified` answer naming none is
/// `unverified`.
fn verdict(answer: SubmitArgs, changes: Vec<CodeChange>) -> Verdict {
    let mut ids = answer.sources;
    ids.sort_unstable();
    ids.dedup();
    let mut changes: Vec<Option<CodeChange>> = changes.into_iter().map(Some).collect();
    let sources: Vec<SourceChange> = ids
        .into_iter()
        .filter_map(|id| changes.get_mut(id.checked_sub(1)?)?.take())
        .map(|change| SourceChange {
            title: change.title,
            url: change.url,
            number: change.number,
        })
        .collect();
    let status = match (answer.verdict, sources.is_empty()) {
        (_, false) => SourceStatus::Verified,
        (Answer::Noise, true) => return Verdict::Noise,
        (Answer::Verified | Answer::Unverified, true) => SourceStatus::Unverified,
    };
    Verdict::Real(Source {
        status,
        summary: answer.summary,
        changes: sources,
    })
}

fn submit_tool() -> ProviderTool {
    ProviderTool {
        function_declarations: vec![ProviderFunctionDeclaration {
            name: SUBMIT_TOOL.to_string(),
            description: "Submit the verdict on the prompt change.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "verdict": { "type": "string", "enum": ["verified", "unverified", "noise"] },
                    "sources": {
                        "type": "array",
                        "items": { "type": "integer" },
                        "description": "Ids of the code changes that made the prompt change."
                    },
                    "summary": { "type": "string" }
                },
                "required": ["verdict", "sources", "summary"]
            }),
        }],
    }
}

fn text_content(role: Option<&str>, text: &str) -> ProviderContent {
    ProviderContent {
        role: role.map(str::to_string),
        parts: Some(vec![ProviderPart {
            text: Some(text.to_string()),
            ..Default::default()
        }]),
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    };

    use super::*;
    use crate::llm::{
        ProviderClient, ProviderFunctionCall,
        mock::{MockProviderClient, function_call_response},
    };

    fn change(number: Option<u64>) -> CodeChange {
        CodeChange {
            title: format!("change {number:?}"),
            url: "https://github.com/acme/agent/pull/1".to_string(),
            number,
            files: Vec::new(),
        }
    }

    fn answer(verdict: Answer, sources: Vec<usize>) -> SubmitArgs {
        SubmitArgs {
            verdict,
            sources,
            summary: "what".to_string(),
        }
    }

    fn status(verdict: &Verdict) -> Option<&SourceStatus> {
        match verdict {
            Verdict::Noise => None,
            Verdict::Real(source) => Some(&source.status),
        }
    }

    #[test]
    fn sources_name_listed_changes_once() {
        let changes = vec![change(Some(12)), change(None)];
        let verdict = verdict(answer(Answer::Verified, vec![2, 1, 2, 3, 0]), changes);
        let Verdict::Real(source) = verdict else {
            panic!("expected a source");
        };
        assert_eq!(source.status, SourceStatus::Verified);
        let numbers: Vec<_> = source.changes.iter().map(|c| c.number).collect();
        assert_eq!(numbers, vec![Some(12), None]);
    }

    #[test]
    fn verified_without_a_valid_source_is_unverified() {
        let verdict = verdict(answer(Answer::Verified, vec![5]), vec![change(Some(1))]);
        assert_eq!(status(&verdict), Some(&SourceStatus::Unverified));
    }

    #[test]
    fn noise_is_noise_unless_it_names_a_source() {
        let noise = verdict(answer(Answer::Noise, Vec::new()), vec![change(Some(1))]);
        assert_eq!(noise, Verdict::Noise);
        let named = verdict(answer(Answer::Noise, vec![1]), vec![change(Some(1))]);
        assert_eq!(status(&named), Some(&SourceStatus::Verified));
    }

    #[test]
    fn prompt_diff_shows_only_changed_parts() {
        let before = VersionText {
            system_prompt: "You are a bot.\nBe brief.\n".to_string(),
            tool_definitions: "search\n".to_string(),
        };
        let after = VersionText {
            system_prompt: "You are a bot.\nBe very brief.\n".to_string(),
            tool_definitions: "search\n".to_string(),
        };
        let diff = prompt_diff(&before, &after);
        assert!(diff.starts_with("### System prompt\n"));
        assert!(diff.contains("-Be brief.\n+Be very brief.\n"));
        assert!(!diff.contains("### Tools"));
        assert!(prompt_diff(&before, &before).is_empty());
    }

    #[test]
    fn context_omits_patches_past_the_budget() {
        let mut big = change(Some(7));
        big.files = vec![
            ChangedFile {
                filename: "prompts/agent.md".to_string(),
                patch: "+Be very brief.".to_string(),
            },
            ChangedFile {
                filename: "src/huge.ts".to_string(),
                patch: "x".repeat(MAX_CODE_BYTES),
            },
        ];
        let changes = ReleaseChanges {
            repo: "acme/agent".to_string(),
            changes: vec![big],
        };
        let out = context("diff", "abc1234", "def5678", &changes);
        assert!(out.contains("### [1] Pull request #7: change Some(7)"));
        assert!(out.contains("--- prompts/agent.md\n+Be very brief."));
        assert!(out.contains("--- src/huge.ts (diff omitted)"));
    }

    #[tokio::test]
    async fn a_reply_without_submit_gets_one_reminder() {
        let calls = Arc::new(AtomicUsize::new(0));
        let counter = calls.clone();
        let mock = MockProviderClient::with_responder(move |request| {
            counter.fetch_add(1, Ordering::SeqCst);
            // Text only on the first turn, then the call.
            (request.contents.len() > 1).then(|| {
                function_call_response(vec![ProviderFunctionCall {
                    id: Some("call".to_string()),
                    name: SUBMIT_TOOL.to_string(),
                    args: Some(json!({ "verdict": "noise", "sources": [], "summary": "dates" })),
                }])
            })
        });
        let client = LlmClient::from_provider("mock", ProviderClient::Mock(mock));

        let answer = judge(&client, Uuid::new_v4(), "context".to_string()).await;

        assert_eq!(calls.load(Ordering::SeqCst), 2);
        assert!(matches!(
            answer,
            Ok(Some(SubmitArgs {
                verdict: Answer::Noise,
                ..
            }))
        ));
    }
}
