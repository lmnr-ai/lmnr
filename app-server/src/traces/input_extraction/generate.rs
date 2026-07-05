//! The agentic lite-LLM pipeline that generates an extraction regex from
//! sample input, plus the prompt it runs on.
//!
//! The model gets two tools: `try_extraction_regex` probes a candidate
//! pattern (we apply it to the ORIGINAL sample input and return the final
//! user-visible result), `submit_extraction_regex` ends the pipeline. The
//! model may probe as many times as it wants within the call budget.

use std::sync::Arc;

use tracing::Instrument;

use super::regex::{ApplyRegexResult, apply_regex, apply_result_to_json};
use super::self_tracing::{self, SpanBuilder, SpanScope};
use crate::llm::models::{
    ModelSize, ProviderContent, ProviderFunctionDeclaration, ProviderFunctionResponse,
    ProviderGenerationConfig, ProviderPart, ProviderRequest, ProviderResponse,
    ProviderThinkingConfig, ProviderThinkingLevel, ProviderTool,
};
use crate::llm::{LlmClient, request_to_span_input, request_to_tools_attr};

const REGEX_LLM_TIMEOUT_SECS: u64 = 120;
/// Total LLM-call budget per pipeline (initial call + probe round-trips).
/// The prompt tells the model probing is unlimited; this cap only bounds
/// a runaway loop — hitting it is treated as "no regex produced".
const MAX_LLM_CALLS: usize = 6;

const TRY_TOOL_NAME: &str = "try_extraction_regex";
const SUBMIT_TOOL_NAME: &str = "submit_extraction_regex";

const REGEX_GENERATION_SYSTEM_PROMPT: &str = r#"# Task

You are shown ONE message that was sent as input to an AI agent. Write a regex that extracts the instruction the agent was asked to carry out and discards everything the harness injected around it.

# The template model

Messages like this one are produced by templates. A harness takes an instruction (written by a person, a parent agent, a ticket, a bot) and assembles the final message by inserting it — together with injected material such as environment info, file contents, tool inventories, reminders, and metadata — into a fixed layout.

Every piece of the message is one of two kinds of text:
- STATIC text comes from the template and recurs verbatim in every message built from it: section delimiters, tag names, labels, headers, boilerplate sentences.
- VARIABLE text differs per message: the instruction itself, and the injected data.

Your regex will be cached and re-applied to future messages from the same template. Those messages share the static text but carry entirely different variable text, so the pattern must anchor ONLY on static text and capture the instruction. Anchoring on any of this message's variable text (its specific words, names, data) makes the pattern fail or mis-extract on the very next message.

# What scaffolding looks like

Injected blocks are delimited in whatever syntax the harness happened to pick, and the syntax itself carries no meaning. XML-like tags, delimiter lines ("=== ENVIRONMENT ==="), markdown headings, ALL-CAPS labels, bracketed section headers, and JSON envelopes all play the same role. Classify every marker by its FUNCTION — does it delimit injected material, or the instruction? — never by its syntax.

Beware markup living INSIDE variable text: HTML or markdown inside a quoted PR body, bot comment, or pasted document is part of the instruction's content, not scaffolding, even when it looks tag-like. HTML comments (<!-- … -->) are never anchors. The instruction's source is irrelevant — if a block is not harness-injected, it is the instruction.

The message may carry "== lmnr_part_separator ==" lines separating sibling message parts. They are present when your regex runs and are stripped from the captured text afterwards.

# Procedure

1. Segment the message: which blocks are harness-injected, and which block is the instruction — the request, question, or task description someone actually wrote for this specific message?
2. Pick anchor material: the static text nearest the instruction on each side. Confirm each anchor would appear unchanged in a different message from this harness; if it is this message's content, it cannot anchor.
3. Write the pattern with exactly one capture group around the instruction. Recurring layouts:
   - Scaffolding first, instruction last → (?s).*STATIC_END\s*(.*) — the leading greedy .* is mandatory: it anchors on the LAST occurrence of STATIC_END, not the first.
   - Instruction first, scaffolding after → (?s)^(.*?)STATIC_START — the ^ plus LAZY (.*?) are mandatory: they anchor on the FIRST occurrence of STATIC_START. Only valid when the message does not begin with scaffolding.
   - Instruction inside its own envelope → (?s)ENVELOPE_START\s*(.*?)\s*ENVELOPE_END.
   - Entire message is scaffolding, no instruction anywhere → (?s)() — empty capture.
   - No scaffolding, or no reliable static anchor → (?s)(.*) — passthrough. When unsure, prefer passthrough: capturing too much is recoverable, silently dropping the instruction is not.
4. Narrow when the structure supports it: if the instruction region is itself structured (say, a JSON object where one field is the task), capture just that field, anchoring on its static field name.
5. Probe with try_extraction_regex whenever you are not fully certain — unusual layout, an anchor occurring more than once, any narrowing. If the probe result is wrong, rethink your segmentation and anchors. A single confident passthrough may be submitted without probing.
6. Finish with submit_extraction_regex — submitting is the only way to finish. Submit an empty string only when no valid pattern can be produced at all; an uncertain case should be a passthrough, not an empty submit.

# Tools

- try_extraction_regex: probes a candidate pattern. It is applied to the ORIGINAL message (full text, separator lines included) and you get back the FINAL user-visible result: capture group 1 with the "== lmnr_part_separator ==" lines already stripped and the parts re-joined. Judge it as the end product and do not expect the separator lines in it. Every pattern — probed or submitted — always runs against the original message; never write a pattern against a probe's result text.
- submit_extraction_regex: submits the final pattern (starts with "(?s)", no surrounding quotes) and ends the pipeline. You may probe as many times as you want first. A submitted pattern that does not match this message is rejected and returned to you — probe, fix the pattern, and submit again.

# Rules

- Exactly one capture group. Always prefix with (?s).
- Anchor text must appear VERBATIM in the message. Never invent markers and never copy marker names from these instructions.
- Never nest quantifiers (no (a+)+-style patterns).
- The pattern must match this message — and, because it anchors only on static text, every future message from the same template."#;

/// Agentic LLM pipeline generating one extraction regex from a single
/// sample input: the model probes candidate patterns with
/// `try_extraction_regex` (applied here, result returned to it) and
/// finishes with `submit_extraction_regex`. Errors only on timeout /
/// provider error — the genuinely transient failures the consumer may
/// requeue. Recoverable slips — a response with no tool call, or a
/// submitted pattern that doesn't match the sample — are pushed back to
/// the model (a nudge / a rejection tool response) and retried within
/// the call budget. Only an explicit empty-string submit (the model's
/// deliberate no-regex verdict) or an exhausted budget is `Ok(None)`: a
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

        // An ACCEPTED submit ends the pipeline even when probe calls ride
        // the same response — the model already committed to a final
        // answer. Accepted means: empty string (the deliberate no-regex
        // verdict — terminal) or a pattern that matches the sample
        // (`Extracted` or `NoUserRequest`). A non-matching submit is NOT
        // accepted — it falls through to the rejection path below and the
        // model gets another attempt within the call budget.
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
                if submitted.is_empty() {
                    return Ok(None);
                }
                if !matches!(
                    apply_regex(submitted, sample_input),
                    ApplyRegexResult::NoMatch
                ) {
                    return Ok(Some(submitted.to_string()));
                }
            }
        }

        // No accepted submit: answer EVERY tool call in the turn (providers
        // require a response per call) — probes get probe results, rejected
        // submits get a correction the model can act on.
        let mut tool_responses: Vec<ProviderPart> = Vec::new();
        for part in parts {
            let Some(fc) = &part.function_call else {
                continue;
            };
            let response = match fc.name.as_str() {
                TRY_TOOL_NAME => {
                    let pattern = fc
                        .args
                        .as_ref()
                        .and_then(|a| a.get("regex"))
                        .and_then(|v| v.as_str())
                        .map(str::trim)
                        .unwrap_or("");
                    // Always against the ORIGINAL sample input — the prompt
                    // promises probes never chain off each other's results.
                    probe_extraction_regex(pattern, sample_input, tracing)
                }
                SUBMIT_TOOL_NAME => serde_json::json!({
                    "result": "rejected",
                    "detail": "the submitted pattern does not match the message (no match, \
                               invalid pattern, or no capture group 1), so it was not \
                               accepted; probe with try_extraction_regex, then submit a \
                               pattern that matches",
                }),
                other => serde_json::json!({
                    "result": "error",
                    "detail": format!(
                        "unknown tool `{other}`; the only tools are \
                         try_extraction_regex and submit_extraction_regex"
                    ),
                }),
            };
            tool_responses.push(ProviderPart {
                function_response: Some(ProviderFunctionResponse {
                    id: fc.id.clone(),
                    name: fc.name.clone(),
                    response,
                }),
                ..Default::default()
            });
        }

        // Append the model turn VERBATIM (keeps thoughts / signatures the
        // provider needs echoed back), then this turn's tool responses —
        // or, when the model produced no tool call at all, a plain-text
        // nudge. Either way the loop continues: only an accepted submit,
        // an explicit empty-string submit, or budget exhaustion ends it.
        contents.push(model_content.cloned().unwrap_or(ProviderContent {
            role: Some("model".to_string()),
            parts: None,
        }));
        contents.push(ProviderContent {
            role: Some("user".to_string()),
            parts: Some(if tool_responses.is_empty() {
                vec![ProviderPart {
                    text: Some(
                        "Respond with a tool call: probe a candidate pattern with \
                         try_extraction_regex, or finish with submit_extraction_regex. \
                         Submit an empty string only if no valid pattern can be produced."
                            .to_string(),
                    ),
                    ..Default::default()
                }]
            } else {
                tool_responses
            }),
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
        provider: Some(extraction_provider()),
        model_size: Some(ModelSize::Medium),
    }
}

/// Provider for the regex-generation calls: `INPUT_EXTRACTION_LLM_PROVIDER`,
/// defaulting to bedrock (medium → Sonnet 5). Either way, a provider without
/// a registered client (missing credentials) silently falls back to the
/// `LLM_PROVIDER` default inside `LlmClient::resolve`.
fn extraction_provider() -> String {
    // `mod env` shadows `std::env`, hence the fully-qualified read.
    std::env::var(crate::env::user_task::INPUT_EXTRACTION_LLM_PROVIDER)
        .ok()
        .map(|v| v.trim().to_lowercase())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| "bedrock".to_string())
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
