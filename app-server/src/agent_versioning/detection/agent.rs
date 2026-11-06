//! The detection LLM loop: the model groups unlabelled samples into agents,
//! tries checks with `test_check`, and saves them with `submit`, which
//! validates every item ([`Session::submit`]). Ends when a submission is fully
//! accepted, when the model answers without a tool call, or at the step cap.

use anyhow::Result;
use serde::de::DeserializeOwned;
use serde_json::{Value, json};
use tracing::Instrument;
use uuid::Uuid;

use super::session::{Session, Submission};
use crate::{
    instrumentation::spans::{self, InternalSpan, SpanType},
    llm::{
        LlmClient, LlmFeature, LlmRoute, ModelProvider, ProviderContent,
        ProviderFunctionDeclaration, ProviderFunctionResponse, ProviderGenerationConfig,
        ProviderPart, ProviderRequest, ProviderTool, request_to_span_input, request_to_tools_attr,
    },
};

const INTERNAL_TRACING_TARGET: &str = "lmnr::internal";
const MAX_STEPS: usize = 10;
/// Room for a reasoning model to think and still emit its tool call.
const MAX_OUTPUT_TOKENS: i32 = 16_000;
const TEST_CHECK_TOOL: &str = "test_check";
const SUBMIT_TOOL: &str = "submit";

const INSTRUCTIONS: &str = "You maintain the list of AI agents in an observability project. \
Each agent has a check: it matches a system prompt when every substring of any one \
alternative (`any_of: [[substring, ...], ...]`) occurs in the prompt's first 1000 \
characters, ignoring case and whitespace.

You get the project's known agents (name, check, and opening of their latest prompt) and \
samples: openings of prompts that no check matched.

Group the samples by the agent that sent them, then for each group either:
- extend a known agent whose prompt changed (`updates`; the added alternatives are kept \
next to the old ones), or
- define a new agent with a short human-readable name (2-4 words, its role) and a check.

Rules for checks:
- Use static text that every prompt of the agent carries, usually its role statement \
(\"You are a GTM assistant...\"). Never use dynamic content: dates, names, ids, \
organizations, counts, credits, user context.
- A check must not match other agents' prompts, so avoid boilerplate several agents share.
- Prefer one or two distinctive sentences or phrases.

A new agent must match at least {min_matches} samples. Leave alone samples that are \
one-off, such as ad-hoc subagents; it is fine to submit nothing.

Test checks with `test_check` before submitting. `submit` reports rejected items; fix and \
resubmit them or drop them.";

/// Runs the loop; accepted changes accumulate in `session.changes`.
pub async fn run(
    llm_client: &LlmClient,
    session: &mut Session,
    project_id: Uuid,
    internal_project_id: Option<Uuid>,
) -> Result<()> {
    let root = InternalSpan::wrap(
        tracing::info_span!(target: INTERNAL_TRACING_TARGET, parent: None, "agent.detection"),
        SpanType::Default,
    )
    .project(internal_project_id)
    .metadata_str("project_id", &project_id.to_string())
    .build();
    let mut contents = vec![text_content(Some("user"), &render_context(session))];
    let instructions = INSTRUCTIONS.replace("{min_matches}", &session.min_matches.to_string());

    async {
        for step in 0..MAX_STEPS {
            let request = ProviderRequest {
                contents: contents.clone(),
                system_instruction: Some(text_content(None, &instructions)),
                tools: Some(vec![tools()]),
                generation_config: Some(ProviderGenerationConfig {
                    max_output_tokens: Some(MAX_OUTPUT_TOKENS),
                    ..Default::default()
                }),
                service_tier: None,
                route: LlmRoute::feature(LlmFeature::AgentDetection, Some(project_id)),
            };
            let parts = generate(llm_client, &request, internal_project_id, step).await?;
            let calls: Vec<_> = parts
                .iter()
                .filter_map(|p| p.function_call.clone())
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
                let result = run_tool(session, &call.name, call.args.unwrap_or(Value::Null));
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
    .instrument(root)
    .await
}

struct ToolResult {
    response: Value,
    /// A submission was accepted whole, so the run is over.
    finished: bool,
}

fn run_tool(session: &mut Session, name: &str, args: Value) -> ToolResult {
    let (response, finished) = match name {
        TEST_CHECK_TOOL => match parse(args) {
            Ok(input) => (session.test_check(input), false),
            Err(error) => (error, false),
        },
        SUBMIT_TOOL => match parse::<Submission>(args) {
            Ok(submission) => {
                let response = session.submit(submission);
                let finished = response["rejected"].as_array().is_none_or(Vec::is_empty);
                (response, finished)
            }
            Err(error) => (error, false),
        },
        other => (json!({ "error": format!("Unknown tool: {other}") }), false),
    };
    ToolResult { response, finished }
}

fn parse<T: DeserializeOwned>(args: Value) -> Result<T, Value> {
    serde_json::from_value(args).map_err(|e| json!({ "error": format!("Invalid input: {e}") }))
}

/// One model turn, traced as an LLM span under the run's root span.
async fn generate(
    llm_client: &LlmClient,
    request: &ProviderRequest,
    internal_project_id: Option<Uuid>,
    step: usize,
) -> Result<Vec<ProviderPart>> {
    let ModelProvider { model, provider } = llm_client.resolve_model_provider(request).await;
    let span = InternalSpan::wrap(
        tracing::info_span!(target: INTERNAL_TRACING_TARGET, "llm_call"),
        SpanType::LLM,
    )
    .project(internal_project_id)
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

fn render_context(session: &Session) -> String {
    let agents: String = session
        .agents
        .iter()
        .enumerate()
        .map(|(index, known)| {
            let check = serde_json::to_string(&known.agent.definition.any_of).unwrap_or_default();
            let example = known
                .example
                .as_ref()
                .map(|example| example.text.as_str())
                .unwrap_or("(no recent prompt)");
            format!(
                "<agent id=\"{}\" name=\"{}\">\n<check>{check}</check>\n<latest_prompt>\n{example}\n</latest_prompt>\n</agent>\n",
                index + 1,
                known.agent.name.as_deref().unwrap_or_default(),
            )
        })
        .collect();
    let samples: String = session
        .samples
        .iter()
        .enumerate()
        .map(|(index, sample)| {
            format!(
                "<sample id=\"{}\">\n{}\n</sample>\n",
                index + 1,
                sample.text
            )
        })
        .collect();
    format!("<agents>\n{agents}</agents>\n\n<samples>\n{samples}</samples>")
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

fn tools() -> ProviderTool {
    let check = json!({
        "type": "array",
        "description": "Alternatives; each is a list of substrings that must all occur.",
        "items": { "type": "array", "items": { "type": "string" } }
    });
    ProviderTool {
        function_declarations: vec![
            ProviderFunctionDeclaration {
                name: TEST_CHECK_TOOL.to_string(),
                description: "Report which samples and which known agents' latest prompts a \
                    check matches."
                    .to_string(),
                parameters: json!({
                    "type": "object",
                    "properties": { "any_of": check },
                    "required": ["any_of"]
                }),
            },
            ProviderFunctionDeclaration {
                name: SUBMIT_TOOL.to_string(),
                description: "Save new agents and extend known agents' checks. Reports the \
                    items it rejected and why."
                    .to_string(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "new_agents": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "name": { "type": "string" },
                                    "any_of": check
                                },
                                "required": ["name", "any_of"]
                            }
                        },
                        "updates": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "agent_id": { "type": "integer" },
                                    "add_any_of": check
                                },
                                "required": ["agent_id", "add_any_of"]
                            }
                        }
                    }
                }),
            },
        ],
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    };

    use super::*;
    use crate::{
        agent_versioning::detection::session::Sample,
        llm::{
            ProviderClient, ProviderFunctionCall,
            mock::{MockProviderClient, function_call_response},
        },
    };

    fn submit_call(substring: &str) -> ProviderFunctionCall {
        ProviderFunctionCall {
            id: Some("call".to_string()),
            name: SUBMIT_TOOL.to_string(),
            args: Some(json!({ "new_agents": [{ "name": "GTM", "any_of": [[substring]] }] })),
        }
    }

    #[tokio::test]
    async fn a_rejected_submission_is_fixed_on_the_next_turn() {
        let calls = Arc::new(AtomicUsize::new(0));
        let counter = calls.clone();
        let mock = MockProviderClient::with_responder(move |request| {
            counter.fetch_add(1, Ordering::SeqCst);
            // The first turn picks a sample's dynamic date; the retry, the role.
            let substring = match request.contents.len() {
                1 => "day 0",
                _ => "gtm assistant",
            };
            Some(function_call_response(vec![submit_call(substring)]))
        });
        let llm_client = LlmClient::from_provider("mock", ProviderClient::Mock(mock));
        let samples = (0..3)
            .map(|i| Sample::of(&format!("Today is day {i}.\nYou are a GTM assistant.")))
            .collect();
        let mut session = Session::new(samples, Vec::new(), 3);

        run(&llm_client, &mut session, Uuid::new_v4(), None)
            .await
            .unwrap();

        assert_eq!(calls.load(Ordering::SeqCst), 2);
        assert_eq!(session.changes.len(), 1);
    }
}
