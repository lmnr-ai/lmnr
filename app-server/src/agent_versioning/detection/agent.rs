//! The detection agent: an LLM groups unlabelled system prompts into agents,
//! tries checks with `test_check`, and saves them with `submit`. Every item it
//! submits is validated before it is accepted. The run ends when a submission
//! is accepted whole, when the model answers without a tool call, or at the
//! step cap.

use anyhow::Result;
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use serde_json::{Value, json};
use tracing::Instrument;
use uuid::Uuid;

use super::prompt::{self, SUBMIT_TOOL, TEST_CHECK_TOOL};
use crate::{
    agent_versioning::definition::{Definition, OPENING_CHARS},
    db::agent_versioning::DefinedAgent,
    instrumentation::spans::{self, InternalSpan, SpanType},
    llm::{
        LlmClient, LlmFeature, LlmRoute, ModelProvider, ProviderContent, ProviderFunctionResponse,
        ProviderGenerationConfig, ProviderPart, ProviderRequest, request_to_span_input,
        request_to_tools_attr,
    },
    utils::truncate_chars,
};

const INTERNAL_TRACING_TARGET: &str = "lmnr::internal";
const MAX_STEPS: usize = 10;
/// Room for a reasoning model to think and still emit its tool call.
const MAX_OUTPUT_TOKENS: i32 = 16_000;

/// A system prompt no definition matched, with the span it came from.
pub struct UnlabelledPrompt {
    pub trace_id: Uuid,
    pub span_id: Uuid,
    pub system_prompt: String,
    /// The trace's start, ns.
    pub time: i64,
}

/// A defined agent with its latest system prompt, when one was ingested
/// recently.
pub struct KnownAgent {
    pub agent: DefinedAgent,
    pub latest: Option<LatestPrompt>,
}

pub struct LatestPrompt {
    pub system_prompt: String,
    /// The span's start, ns.
    pub time: i64,
}

/// An accepted change. `Extend` carries the agent's full new definition.
#[derive(Debug, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Change {
    Create {
        name: String,
        definition: Definition,
    },
    Extend {
        agent_id: Uuid,
        definition: Definition,
    },
}

/// Prompts and agents are referred to by their 1-based position, as numbered
/// in [`prompt::context`].
pub struct DetectionAgent<'a> {
    llm_client: &'a LlmClient,
    project_id: Uuid,
    /// Where the run's own LLM calls are traced; `None` traces nothing.
    internal_project_id: Option<Uuid>,
    /// A new check must match at least this many of `prompts`.
    min_matches: usize,
    prompts: Vec<UnlabelledPrompt>,
    agents: Vec<KnownAgent>,
    /// Accepted so far; kept when a later LLM call fails.
    changes: Vec<Change>,
}

#[derive(Debug, Deserialize)]
struct CheckArgs {
    any_of: Vec<Vec<String>>,
}

#[derive(Debug, Deserialize)]
struct SubmitArgs {
    #[serde(default)]
    new_agents: Vec<NewAgent>,
    #[serde(default)]
    updates: Vec<Update>,
}

#[derive(Debug, Deserialize)]
struct NewAgent {
    name: String,
    any_of: Vec<Vec<String>>,
}

#[derive(Debug, Deserialize)]
struct Update {
    agent_id: usize,
    add_any_of: Vec<Vec<String>>,
}

struct ToolResult {
    response: Value,
    /// A submission was accepted whole, so the run is over.
    finished: bool,
}

impl<'a> DetectionAgent<'a> {
    pub fn new(
        llm_client: &'a LlmClient,
        project_id: Uuid,
        internal_project_id: Option<Uuid>,
        min_matches: usize,
        prompts: Vec<UnlabelledPrompt>,
        agents: Vec<KnownAgent>,
    ) -> Self {
        Self {
            llm_client,
            project_id,
            internal_project_id,
            min_matches,
            prompts,
            agents,
            changes: Vec::new(),
        }
    }

    /// The accepted changes. An LLM failure only ends the run early.
    pub async fn run(mut self) -> Vec<Change> {
        let root = InternalSpan::wrap(
            tracing::info_span!(target: INTERNAL_TRACING_TARGET, parent: None, "agent.detection"),
            SpanType::Default,
        )
        .project(self.internal_project_id)
        .metadata_str("project_id", &self.project_id.to_string())
        .input(&self.trace_input())
        .build();
        if let Err(e) = self.converse().instrument(root.clone()).await {
            spans::record_error(&root, e.to_string());
            log::warn!(
                "[AGENT DETECTION] {} run ended early: {e:?}",
                self.project_id
            );
        }
        spans::set_output(&root, &json!({ "changes": self.changes }));
        self.changes
    }

    /// The run's inputs by the ids the model sees, each prompt pointing back
    /// to its span in the source project.
    fn trace_input(&self) -> Value {
        let prompts: Vec<Value> = numbered(&self.prompts)
            .map(|(id, prompt)| {
                json!({
                    "id": id,
                    "trace_id": prompt.trace_id,
                    "span_id": prompt.span_id,
                    "opening": truncate_chars(&prompt.system_prompt, OPENING_CHARS),
                    "seen": prompt::format_time(prompt.time),
                })
            })
            .collect();
        let agents: Vec<Value> = numbered(&self.agents)
            .map(|(id, known)| {
                json!({
                    "id": id,
                    "agent_id": known.agent.id,
                    "name": known.agent.name,
                    "check": known.agent.definition.any_of,
                    "last_seen": known.latest.as_ref().map(|latest| prompt::format_time(latest.time)),
                })
            })
            .collect();
        json!({ "prompts": prompts, "agents": agents, "min_matches": self.min_matches })
    }

    async fn converse(&mut self) -> Result<()> {
        let instructions = prompt::instructions(self.min_matches);
        let mut contents = vec![text_content(
            Some("user"),
            &prompt::context(&self.prompts, &self.agents),
        )];
        for step in 0..MAX_STEPS {
            let request = ProviderRequest {
                contents: contents.clone(),
                system_instruction: Some(text_content(None, &instructions)),
                tools: Some(vec![prompt::tools()]),
                generation_config: Some(ProviderGenerationConfig {
                    max_output_tokens: Some(MAX_OUTPUT_TOKENS),
                    ..Default::default()
                }),
                service_tier: None,
                route: LlmRoute::feature(LlmFeature::AgentDetection, Some(self.project_id)),
            };
            let parts = self.generate(&request, step).await?;
            let calls: Vec<_> = parts
                .iter()
                .filter_map(|part| part.function_call.clone())
                .collect();
            if calls.is_empty() {
                return Ok(());
            }
            contents.push(ProviderContent {
                role: Some("model".to_string()),
                parts: Some(parts),
            });

            let mut finished = false;
            let mut responses = Vec::with_capacity(calls.len());
            for call in calls {
                let args = call.args.unwrap_or(Value::Null);
                let span = InternalSpan::wrap(
                    tracing::info_span!(target: INTERNAL_TRACING_TARGET, "tool_call"),
                    SpanType::Tool,
                )
                .project(self.internal_project_id)
                .input(&json!({ "name": call.name, "args": args }))
                .step(step)
                .build();
                let result = span.in_scope(|| self.call_tool(&call.name, args));
                spans::set_output(&span, &result.response);
                finished |= result.finished;
                responses.push(ProviderPart {
                    function_response: Some(ProviderFunctionResponse {
                        id: call.id,
                        name: call.name,
                        response: result.response,
                    }),
                    ..Default::default()
                });
            }
            if finished {
                return Ok(());
            }
            contents.push(ProviderContent {
                role: Some("user".to_string()),
                parts: Some(responses),
            });
        }
        Ok(())
    }

    /// One model turn, traced as an LLM span under the run's root span.
    async fn generate(&self, request: &ProviderRequest, step: usize) -> Result<Vec<ProviderPart>> {
        let ModelProvider { model, provider } =
            self.llm_client.resolve_model_provider(request).await;
        let span = InternalSpan::wrap(
            tracing::info_span!(target: INTERNAL_TRACING_TARGET, "llm_call"),
            SpanType::LLM,
        )
        .project(self.internal_project_id)
        .input(&request_to_span_input(request))
        .tools(request_to_tools_attr(request).as_ref())
        .model(&provider, &model)
        .step(step)
        .build();
        let response = match self
            .llm_client
            .generate_content(request)
            .instrument(span.clone())
            .await
        {
            Ok(response) => response,
            Err(e) => {
                spans::record_error(&span, e.to_string());
                anyhow::bail!("agent detection LLM call failed: {e:?}");
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

    fn call_tool(&mut self, name: &str, args: Value) -> ToolResult {
        let unfinished = |response| ToolResult {
            response,
            finished: false,
        };
        match name {
            TEST_CHECK_TOOL => match parse_args(args) {
                Ok(args) => unfinished(self.test_check(args)),
                Err(error) => unfinished(error),
            },
            SUBMIT_TOOL => match parse_args(args) {
                Ok(args) => self.submit(args),
                Err(error) => unfinished(error),
            },
            other => unfinished(json!({ "error": format!("Unknown tool: {other}") })),
        }
    }

    /// Which prompts and which agents' latest prompts the check matches.
    fn test_check(&self, args: CheckArgs) -> Value {
        let Some(definition) = Definition::new(args.any_of) else {
            return json!({ "error": "The check has no non-empty substring." });
        };
        json!({
            "matched_prompts": self.matched_prompts(&definition),
            "matched_agents": self.matched_agents(&definition, None),
        })
    }

    /// Accepts every valid item into `changes` and reports the rejected ones,
    /// which the model may fix and submit again.
    fn submit(&mut self, args: SubmitArgs) -> ToolResult {
        let mut accepted = 0;
        let mut rejected = Vec::new();
        for new_agent in args.new_agents {
            match self.validate_new_agent(&new_agent) {
                Ok(change) => {
                    self.changes.push(change);
                    accepted += 1;
                }
                Err(reason) => {
                    rejected.push(json!({ "new_agent": new_agent.name, "reason": reason }))
                }
            }
        }
        for update in args.updates {
            match self.validate_update(&update) {
                Ok(change) => {
                    self.changes.push(change);
                    accepted += 1;
                }
                Err(reason) => {
                    rejected.push(json!({ "agent_id": update.agent_id, "reason": reason }))
                }
            }
        }
        ToolResult {
            finished: rejected.is_empty(),
            response: json!({ "accepted": accepted, "rejected": rejected }),
        }
    }

    fn validate_new_agent(&self, new_agent: &NewAgent) -> Result<Change, String> {
        let name = new_agent.name.trim();
        if name.is_empty() {
            return Err("The name is empty.".to_string());
        }
        let definition = Definition::new(new_agent.any_of.clone())
            .ok_or("The check has no non-empty substring.")?;
        self.validate_check(&definition, None)?;
        if self.is_created(&definition) {
            return Err("An agent with this check was already accepted.".to_string());
        }
        Ok(Change::Create {
            name: name.to_string(),
            definition,
        })
    }

    fn validate_update(&self, update: &Update) -> Result<Change, String> {
        let known = update
            .agent_id
            .checked_sub(1)
            .and_then(|index| self.agents.get(index))
            .ok_or("No agent has this id.")?;
        let added = Definition::new(update.add_any_of.clone())
            .ok_or("The added check has no non-empty substring.")?;
        self.validate_check(&added, Some(update.agent_id))?;
        Ok(Change::Extend {
            agent_id: known.agent.id,
            definition: self.current_definition(known).extended(&added),
        })
    }

    /// A check must cover enough prompts to be a recurring agent, and must not
    /// claim another agent's prompts.
    fn validate_check(
        &self,
        definition: &Definition,
        own_agent: Option<usize>,
    ) -> Result<(), String> {
        let matched = self.matched_prompts(definition).len();
        if matched < self.min_matches {
            return Err(format!(
                "Matches {matched} prompts; at least {} are needed.",
                self.min_matches
            ));
        }
        let others = self.matched_agents(definition, own_agent);
        if !others.is_empty() {
            return Err(format!(
                "Also matches the latest prompt of agents {others:?}."
            ));
        }
        Ok(())
    }

    fn matched_prompts(&self, definition: &Definition) -> Vec<usize> {
        numbered(&self.prompts)
            .filter(|(_, prompt)| definition.matches(&prompt.system_prompt))
            .map(|(id, _)| id)
            .collect()
    }

    fn matched_agents(&self, definition: &Definition, except: Option<usize>) -> Vec<usize> {
        numbered(&self.agents)
            .filter(|(id, _)| Some(*id) != except)
            .filter(|(_, known)| {
                known
                    .latest
                    .as_ref()
                    .is_some_and(|latest| definition.matches(&latest.system_prompt))
            })
            .map(|(id, _)| id)
            .collect()
    }

    fn is_created(&self, definition: &Definition) -> bool {
        self.changes.iter().any(|change| {
            matches!(change, Change::Create { definition: created, .. } if created == definition)
        })
    }

    /// The agent's definition with this run's accepted extensions.
    fn current_definition(&self, known: &KnownAgent) -> Definition {
        self.changes
            .iter()
            .rev()
            .find_map(|change| match change {
                Change::Extend {
                    agent_id,
                    definition,
                } if *agent_id == known.agent.id => Some(definition.clone()),
                _ => None,
            })
            .unwrap_or_else(|| known.agent.definition.0.clone())
    }
}

fn numbered<T>(items: &[T]) -> impl Iterator<Item = (usize, &T)> {
    items
        .iter()
        .enumerate()
        .map(|(index, item)| (index + 1, item))
}

fn parse_args<T: DeserializeOwned>(args: Value) -> Result<T, Value> {
    serde_json::from_value(args).map_err(|e| json!({ "error": format!("Invalid input: {e}") }))
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

    use sqlx::types::Json;

    use super::*;
    use crate::llm::{
        ProviderClient, ProviderFunctionCall,
        mock::{MockProviderClient, function_call_response},
    };

    fn check(any_of: &[&[&str]]) -> Vec<Vec<String>> {
        any_of
            .iter()
            .map(|all_of| all_of.iter().map(|s| s.to_string()).collect())
            .collect()
    }

    fn known(name: &str, any_of: &[&[&str]], latest_prompt: &str) -> KnownAgent {
        KnownAgent {
            agent: DefinedAgent {
                id: Uuid::new_v4(),
                agent_hash: Uuid::new_v4().simple().to_string(),
                name: Some(name.to_string()),
                definition: Json(Definition::new(check(any_of)).unwrap()),
            },
            latest: Some(LatestPrompt {
                system_prompt: latest_prompt.to_string(),
                time: 0,
            }),
        }
    }

    fn unlabelled(system_prompt: &str) -> UnlabelledPrompt {
        UnlabelledPrompt {
            trace_id: Uuid::new_v4(),
            span_id: Uuid::new_v4(),
            system_prompt: system_prompt.to_string(),
            time: 0,
        }
    }

    fn gtm_prompts(count: usize) -> Vec<UnlabelledPrompt> {
        (0..count)
            .map(|i| {
                unlabelled(&format!(
                    "Today is day {i}. User #{i}.\nYou are a GTM assistant."
                ))
            })
            .collect()
    }

    fn mock_client() -> LlmClient {
        LlmClient::from_provider("mock", ProviderClient::Mock(MockProviderClient::new()))
    }

    fn agent<'a>(
        llm_client: &'a LlmClient,
        prompts: Vec<UnlabelledPrompt>,
        agents: Vec<KnownAgent>,
    ) -> DetectionAgent<'a> {
        DetectionAgent::new(llm_client, Uuid::new_v4(), None, 3, prompts, agents)
    }

    fn submit_new(agent: &mut DetectionAgent, name: &str, any_of: &[&[&str]]) -> Value {
        let args = json!({ "new_agents": [{ "name": name, "any_of": check(any_of) }] });
        agent.call_tool(SUBMIT_TOOL, args).response
    }

    #[test]
    fn test_check_reports_matching_prompts_and_agents() {
        let client = mock_client();
        let prompts = vec![
            unlabelled("You are a GTM assistant."),
            unlabelled("You are a coder."),
        ];
        let agents = vec![known("Coder", &[&["you are a coder"]], "You are a coder.")];
        let mut agent = agent(&client, prompts, agents);
        let result = agent
            .call_tool(TEST_CHECK_TOOL, json!({ "any_of": [["you are a"]] }))
            .response;
        assert_eq!(result["matched_prompts"], json!([1, 2]));
        assert_eq!(result["matched_agents"], json!([1]));
    }

    #[test]
    fn new_agent_is_accepted_when_it_matches_enough_prompts() {
        let client = mock_client();
        let mut agent = agent(&client, gtm_prompts(3), Vec::new());
        let result = submit_new(
            &mut agent,
            " GTM Assistant ",
            &[&["You are a GTM assistant"]],
        );
        assert_eq!(result["accepted"], json!(1));
        assert_eq!(
            agent.changes,
            vec![Change::Create {
                name: "GTM Assistant".to_string(),
                definition: Definition::new(check(&[&["you are a gtm assistant"]])).unwrap(),
            }]
        );
    }

    #[test]
    fn one_off_prompts_do_not_become_agents() {
        let client = mock_client();
        let mut prompts = gtm_prompts(5);
        prompts.push(unlabelled("You are a one-off subagent."));
        let mut agent = agent(&client, prompts, Vec::new());
        let result = submit_new(&mut agent, "Subagent", &[&["one-off subagent"]]);
        assert_eq!(result["accepted"], json!(0));
        assert!(agent.changes.is_empty());
    }

    #[test]
    fn a_check_claiming_a_known_agent_is_rejected() {
        let client = mock_client();
        let agents = vec![known(
            "GTM",
            &[&["gtm assistant v1"]],
            "You are a GTM assistant v1.",
        )];
        let mut agent = agent(&client, gtm_prompts(3), agents);
        let result = submit_new(&mut agent, "GTM 2", &[&["gtm assistant"]]);
        assert_eq!(result["accepted"], json!(0));
        assert_eq!(result["rejected"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn a_duplicate_new_agent_is_rejected() {
        let client = mock_client();
        let mut agent = agent(&client, gtm_prompts(3), Vec::new());
        submit_new(&mut agent, "GTM", &[&["gtm assistant"]]);
        let result = submit_new(&mut agent, "GTM again", &[&["gtm assistant"]]);
        assert_eq!(result["accepted"], json!(0));
        assert_eq!(agent.changes.len(), 1);
    }

    #[test]
    fn update_adds_an_alternative_and_keeps_the_old_one() {
        let client = mock_client();
        let agents = vec![known(
            "GTM",
            &[&["you are a sales bot"]],
            "You are a sales bot.",
        )];
        let agent_id = agents[0].agent.id;
        let mut agent = agent(&client, gtm_prompts(3), agents);
        let args = json!({ "updates": [{ "agent_id": 1, "add_any_of": [["gtm assistant"]] }] });
        let result = agent.call_tool(SUBMIT_TOOL, args).response;
        assert_eq!(result["accepted"], json!(1));
        assert_eq!(
            agent.changes,
            vec![Change::Extend {
                agent_id,
                definition: Definition::new(check(&[&["you are a sales bot"], &["gtm assistant"]]))
                    .unwrap(),
            }]
        );
    }

    #[test]
    fn update_of_an_unknown_agent_is_rejected() {
        let client = mock_client();
        let mut agent = agent(&client, gtm_prompts(3), Vec::new());
        let args = json!({ "updates": [{ "agent_id": 1, "add_any_of": [["gtm assistant"]] }] });
        assert_eq!(
            agent.call_tool(SUBMIT_TOOL, args).response["accepted"],
            json!(0)
        );
    }

    #[tokio::test]
    async fn a_rejected_submission_is_fixed_on_the_next_turn() {
        let calls = Arc::new(AtomicUsize::new(0));
        let counter = calls.clone();
        let mock = MockProviderClient::with_responder(move |request| {
            counter.fetch_add(1, Ordering::SeqCst);
            // The first turn picks a prompt's dynamic date; the retry, the role.
            let substring = match request.contents.len() {
                1 => "day 0",
                _ => "gtm assistant",
            };
            Some(function_call_response(vec![ProviderFunctionCall {
                id: Some("call".to_string()),
                name: SUBMIT_TOOL.to_string(),
                args: Some(json!({ "new_agents": [{ "name": "GTM", "any_of": [[substring]] }] })),
            }]))
        });
        let client = LlmClient::from_provider("mock", ProviderClient::Mock(mock));

        let changes = agent(&client, gtm_prompts(3), Vec::new()).run().await;

        assert_eq!(calls.load(Ordering::SeqCst), 2);
        assert_eq!(changes.len(), 1);
    }
}
