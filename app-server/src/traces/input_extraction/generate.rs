//! The agentic lite-LLM pipeline that generates an extraction regex from
//! sample input, plus the prompt it runs on.
//!
//! The model gets two tools: `try_extraction_regex` probes a candidate
//! pattern (we apply it to the ORIGINAL sample input and return the final
//! user-visible result), `submit_extraction_regex` ends the pipeline. The
//! model may probe as many times as it wants within the call budget.

use std::sync::Arc;

use tracing::Instrument;

use super::regex::{apply_regex, apply_result_to_json};
use super::self_tracing::{self, SpanBuilder, SpanScope};
use crate::llm::models::{
    ModelSize, ProviderContent, ProviderFunctionDeclaration, ProviderFunctionResponse,
    ProviderGenerationConfig, ProviderPart, ProviderRequest, ProviderResponse,
    ProviderThinkingConfig, ProviderThinkingLevel, ProviderTool,
};
use crate::llm::{LlmClient, parsing_provider, request_to_span_input, request_to_tools_attr};

const REGEX_LLM_TIMEOUT_SECS: u64 = 120;
/// Total LLM-call budget per pipeline (initial call + probe round-trips).
/// The prompt tells the model probing is unlimited; this cap only bounds
/// a runaway loop — hitting it is treated as "no regex produced".
const MAX_LLM_CALLS: usize = 6;

const TRY_TOOL_NAME: &str = "try_extraction_regex";
const SUBMIT_TOOL_NAME: &str = "submit_extraction_regex";

const REGEX_GENERATION_SYSTEM_PROMPT: &str = r#"<role>
You write regexes that strip scaffolding wrappers from AI agent conversation messages, leaving the instruction the agent was asked to act on. Agent harnesses wrap each turn's real instruction in semi-structured markup — XML-like tags (e.g. <system-reminder>, <context>, <env>), delimiter lines (e.g. "=== ENVIRONMENT ===", "--- context ---"), bracketed or labeled section headers, or similar markers. Remove the wrapper; keep everything else. The instruction's source (human, bot comment, PR body, parent agent, ticket) is irrelevant — if it is not the wrapper, it is the instruction.
</role>

<generalization>
You see ONE input, but the regex you submit is cached and applied to FUTURE inputs that share this input's structural shape while carrying DIFFERENT content — a different instruction, different prose, different data inside the wrappers. It is crucial to anchor the pattern exclusively on the STATIC scaffolding markers that will recur verbatim across those inputs (wrapper tag names, delimiter lines), never on this particular input's variable content.
</generalization>

<core_principle>
DEFAULT IS PASSTHROUGH. You need POSITIVE evidence (a real harness wrapper marker) before choosing any non-passthrough pattern. When in any doubt, submit (?s)(.*). Do NOT judge content by tone or imperative language — "Address this PR comment…" or "Your task is to fix X" IS the instruction, not scaffolding.
</core_principle>

<procedure>
Follow these steps in order.

1. List every wrapper-like marker in the input and classify each:
   - HARNESS WRAPPER (may anchor on these): structured, self-contained system-injected blocks sitting at the top or bottom of the message, not mid-paragraph. XML-like examples: system-reminder, context, env, environment, tools, tool_list, instructions, skills, reminder, metadata, session, and close relatives. Non-XML markers (delimiter lines, labeled section headers) qualify too when they play the same role.
   - CONTENT (never anchor on these, even if they repeat): HTML/markdown rendering tags (h1-h6, p, br, a, div, span, code, pre, details, summary, table, img, ul, ol, li, …), HTML comments (<!-- … --> — treat them as prose, never as anchors), markdown headings/fences inside prose, and any markup inside a bot comment / PR review / issue body / markdown body.
   The input may carry "== lmnr_part_separator ==" markers separating sibling user-message parts; they are present when the regex runs but are stripped from the captured text afterwards. Treat them as layout hints only: never anchor on one, and a capture may span it.

2. If no HARNESS WRAPPER marker survives → (?s)(.*). Stop. Never fall back to a content marker.

3. Otherwise pick the layout and its pattern. The patterns are written for an XML-like wrapper tag; for a non-XML marker use the same layout with the marker's static text, verbatim, in place of the tag:
   - LEADING: input STARTS with the wrapper; instruction follows the LAST closing marker → (?s).*</tag>\s*(.*)
     The leading .* is mandatory — it makes the greedy engine anchor on the LAST closing marker, not the first.
   - TRAILING: instruction first, wrapper later → (?s)^(.*?)<tag>
     The ^ and LAZY (.*?) are mandatory — anchor on the FIRST opening marker. Only valid when non-trivial prose sits BEFORE the first marker; if the input starts with the wrapper, the layout is LEADING, never TRAILING.
   - WRAPPED: instruction sits inside a request-like wrapper (<user_request>, <task>, <query>, …) → (?s)<tag>\s*(.*?)\s*</tag>
   - ALL SCAFFOLDING: entire input is wrapper blocks with only whitespace outside → (?s)()
   - MIXED or unclear (scaffolding on both sides, no consistent layout) → (?s)(.*)

4. Verify the pattern with try_extraction_regex before submitting whenever you are not fully certain (unusual layout, an anchor marker that appears more than once). If the probe result is wrong, rethink your marker classification and layout choice. A single confident passthrough may be submitted without probing.
</procedure>

<tools>
- try_extraction_regex: probes a candidate pattern. The pattern is applied to the ORIGINAL input (the full text in the first user message, structure markers included) and you get back the FINAL user-visible result: capture group 1 with the "== lmnr_part_separator ==" markers already stripped and the parts re-joined. This is exactly what the user will see — judge it as the end product, and do NOT expect the markers in it. Every regex — probed or submitted — always runs against the original input; never write a regex against a probe's result text.
- submit_extraction_regex: submits the final pattern and ends the pipeline. You may probe as many times as you want, but submitting is the only way to finish.
</tools>

<rules>
- Exactly one capture group. Always prefix with (?s).
- The anchor marker must appear VERBATIM in the input. Never invent marker names and never copy them from this prompt.
- Never anchor on an HTML comment marker (<!-- or -->).
- Keep the pattern simple and cheap to run: literals, character classes, .* / .*? and \s* are all you normally need. Backreferences and lookarounds are supported but almost never necessary — use them only when nothing simpler works, and never nest quantifiers (no (a+)+-style patterns).
- The regex must match this input — and, because it anchors only on static scaffolding, future inputs of the same shape with different content.
</rules>

<output_format>
Call the `submit_extraction_regex` tool with the regex pattern itself (starts with "(?s)", no surrounding quotes, no fences). Use an empty string only if no valid regex can be produced — when in doubt, submit the passthrough instead.
</output_format>"#;

/// Agentic LLM pipeline generating one extraction regex from a single
/// sample input: the model probes candidate patterns with
/// `try_extraction_regex` (applied here, result returned to it) and
/// finishes with `submit_extraction_regex`. Errors only on timeout /
/// provider error — the genuinely transient failures the consumer may
/// requeue. A terminal no-regex verdict (empty-string submit, a response
/// with no tool call, or an exhausted call budget) is `Ok(None)`: a
/// decision, not a transport failure.
pub async fn generate_extraction_regex(
    llm_client: &Arc<LlmClient>,
    sample_input: &str,
    tracing: Option<&SpanScope>,
) -> anyhow::Result<Option<String>> {
    let mut contents = vec![ProviderContent {
        role: Some("user".to_string()),
        parts: Some(vec![ProviderPart {
            text: Some(sample_input.to_string()),
            ..Default::default()
        }]),
    }];

    for _ in 0..MAX_LLM_CALLS {
        let request = build_request(contents.clone());
        let response = call_llm(llm_client, &request, tracing).await?;

        let model_content = response
            .candidates
            .as_ref()
            .and_then(|c| c.first())
            .and_then(|c| c.content.as_ref());
        let parts: &[ProviderPart] = model_content
            .and_then(|c| c.parts.as_deref())
            .unwrap_or_default();

        // Submit ends the pipeline even when probe calls ride the same
        // response — the model already committed to a final answer.
        for part in parts {
            if let Some(fc) = &part.function_call
                && fc.name == SUBMIT_TOOL_NAME
            {
                let submitted = fc
                    .args
                    .as_ref()
                    .and_then(|a| a.get("regex"))
                    .and_then(|v| v.as_str())
                    .map(str::trim)
                    .unwrap_or("");
                return Ok((!submitted.is_empty()).then(|| submitted.to_string()));
            }
        }

        let mut probe_responses: Vec<ProviderPart> = Vec::new();
        for part in parts {
            let Some(fc) = &part.function_call else {
                continue;
            };
            if fc.name != TRY_TOOL_NAME {
                continue;
            }
            let pattern = fc
                .args
                .as_ref()
                .and_then(|a| a.get("regex"))
                .and_then(|v| v.as_str())
                .map(str::trim)
                .unwrap_or("");
            // Always against the ORIGINAL sample input — the prompt
            // promises probes never chain off each other's results.
            let probe = probe_extraction_regex(pattern, sample_input, tracing);
            probe_responses.push(ProviderPart {
                function_response: Some(ProviderFunctionResponse {
                    id: fc.id.clone(),
                    name: TRY_TOOL_NAME.to_string(),
                    response: probe,
                }),
                ..Default::default()
            });
        }

        // No submit and no probe: the model produced no usable tool call
        // (its "no valid regex" verdict, or an empty/blocked response).
        if probe_responses.is_empty() {
            return Ok(None);
        }

        // Append the model turn VERBATIM (keeps thoughts / signatures the
        // provider needs echoed back), then the probe results.
        contents.push(model_content.cloned().unwrap_or(ProviderContent {
            role: Some("model".to_string()),
            parts: None,
        }));
        contents.push(ProviderContent {
            role: Some("user".to_string()),
            parts: Some(probe_responses),
        });
    }

    log::warn!(
        "user-task: regex generation exhausted its {MAX_LLM_CALLS}-call budget without a submit"
    );
    Ok(None)
}

/// Apply a probed pattern to the original sample input and package the
/// FINAL user-visible outcome for the model, tracing the application as
/// a tool span. The extracted text is signpost-stripped exactly like the
/// stored metadata, so the model judges the end product.
fn probe_extraction_regex(
    pattern: &str,
    sample_input: &str,
    tracing: Option<&SpanScope>,
) -> serde_json::Value {
    let span = tracing.map(|scope| {
        SpanBuilder::tool(scope, TRY_TOOL_NAME)
            .input(&serde_json::json!({ "regex": pattern }))
            .build()
    });
    let result = apply_regex(pattern, sample_input);
    let response = apply_result_to_json(&result);
    if let Some(span) = span.as_ref() {
        self_tracing::set_output(span, &response);
    }
    response
}

fn build_request(contents: Vec<ProviderContent>) -> ProviderRequest {
    ProviderRequest {
        contents,
        system_instruction: Some(ProviderContent {
            role: None,
            parts: Some(vec![ProviderPart {
                text: Some(REGEX_GENERATION_SYSTEM_PROMPT.to_string()),
                ..Default::default()
            }]),
        }),
        tools: Some(vec![ProviderTool {
            function_declarations: vec![
                ProviderFunctionDeclaration {
                    name: TRY_TOOL_NAME.to_string(),
                    description: "Probe a candidate regex: it is applied to the ORIGINAL input and the final user-visible extraction result is returned. Call as many times as needed before submitting.".to_string(),
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "regex": {
                                "type": "string",
                                "description": "A regex pattern starting with (?s) with exactly one capture group."
                            }
                        },
                        "required": ["regex"]
                    }),
                },
                ProviderFunctionDeclaration {
                    name: SUBMIT_TOOL_NAME.to_string(),
                    description: "Submit the chosen regex pattern and end the pipeline, or an empty string when no valid pattern can be produced.".to_string(),
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "regex": {
                                "type": "string",
                                "description": "A regex pattern starting with (?s) with exactly one capture group. Empty string for null."
                            }
                        },
                        "required": ["regex"]
                    }),
                },
            ],
        }]),
        generation_config: Some(ProviderGenerationConfig {
            temperature: Some(1.0),
            max_output_tokens: Some(1024),
            thinking_config: Some(ProviderThinkingConfig {
                include_thoughts: Some(true),
                thinking_level: Some(ProviderThinkingLevel::Medium),
            }),
            ..Default::default()
        }),
        service_tier: None,
        provider: parsing_provider(),
        model_size: Some(ModelSize::Medium),
    }
}

/// One traced provider call with a timeout. Errors (timeout / provider)
/// are the transient failures the consumer may requeue.
async fn call_llm(
    llm_client: &Arc<LlmClient>,
    request: &ProviderRequest,
    tracing: Option<&SpanScope>,
) -> anyhow::Result<ProviderResponse> {
    // Build the span before the call — spans can't be backdated, so a
    // span built after the call returns would record ~zero duration.
    let (model, provider) = llm_client.resolve_model_provider(request);
    let span_input = request_to_span_input(request);
    let span_tools = request_to_tools_attr(request);
    let span = tracing.map(|scope| {
        SpanBuilder::llm(scope, "generate_extraction_regex")
            .input(&span_input)
            .model(&provider, &model)
            .tools(span_tools.as_ref())
            .build()
    });

    let call = llm_client.generate_content(request);
    let timed = tokio::time::timeout(std::time::Duration::from_secs(REGEX_LLM_TIMEOUT_SECS), call);
    let result = match span.as_ref() {
        Some(s) => timed.instrument(s.clone()).await,
        None => timed.await,
    };

    let (response, error) = match result {
        Ok(Ok(response)) => (Some(response), None),
        Ok(Err(e)) => (None, Some(format!("regex generation failed: {e}"))),
        Err(_) => (
            None,
            Some(format!(
                "regex generation timed out after {REGEX_LLM_TIMEOUT_SECS}s"
            )),
        ),
    };

    if let Some(span) = span.as_ref() {
        if let Some(response) = response.as_ref() {
            self_tracing::set_output(span, &serde_json::json!(response.candidates));
            let usage = response.usage_metadata.as_ref();
            self_tracing::set_usage(
                span,
                usage.and_then(|u| u.prompt_token_count),
                usage.and_then(|u| u.cache_read_input_tokens),
                usage.and_then(|u| u.candidates_token_count),
            );
        }
        if let Some(error) = error.clone() {
            self_tracing::record_error(span, error);
        }
    }

    match (response, error) {
        (Some(response), _) => Ok(response),
        (None, Some(error)) => Err(anyhow::anyhow!(error)),
        (None, None) => unreachable!(),
    }
}
