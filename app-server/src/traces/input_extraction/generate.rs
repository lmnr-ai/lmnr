//! The agentic lite-LLM pipeline that generates an extraction regex from
//! sample input, plus the prompt it runs on.
//!
//! The model gets two tools: `try_extraction_regex` probes a candidate
//! pattern (we apply it to the ORIGINAL sample input and return the final
//! user-visible result), `submit_extraction_regex` ends the pipeline. The
//! model may probe as many times as it wants within the call budget.

use std::sync::Arc;

<<<<<<< Updated upstream
use backoff::ExponentialBackoffBuilder;
=======
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
/// Initial backoff before the first LLM retry (grows exponentially).
const LLM_RETRY_INITIAL_BACKOFF_SECS: u64 = 2;
/// Stop retrying transient LLM failures once this much wall-clock time
/// has elapsed (the attempts themselves included).
const LLM_RETRY_MAX_ELAPSED_SECS: u64 = 300;
/// Total LLM-call budget per pipeline (initial call + probe round-trips).
/// The prompt tells the model probing is unlimited; this cap only bounds
/// a runaway loop — hitting it is [`GenerationVerdict::Exhausted`].
const MAX_LLM_CALLS: usize = 6;
/// Per-call output budget. Thinking tokens count against it (adaptive
/// thinking on Sonnet shares the cap), so it must be generous: at 1024 the
/// model's turn routinely truncated mid-thinking or mid-tool-call, mangling
/// submit args and burning the whole call budget on nudge cycles.
const MAX_OUTPUT_TOKENS: i32 = 16384;
=======
/// Total LLM-call budget per pipeline (initial call + probe round-trips).
/// The prompt tells the model probing is unlimited; this cap only bounds
/// a runaway loop — hitting it is treated as "no regex produced".
const MAX_LLM_CALLS: usize = 6;
>>>>>>> Stashed changes

const TRY_TOOL_NAME: &str = "try_extraction_regex";
const SUBMIT_TOOL_NAME: &str = "submit_extraction_regex";

<<<<<<< Updated upstream
/// How a generation pipeline ended.
pub enum GenerationVerdict {
    /// Accepted submit: a pattern that extracts non-empty text from the
    /// sample.
    Pattern(String),
    /// The call budget ran out without an accepted submit. The model
    /// never delivered a usable pattern, so the caller falls back to the
    /// passthrough regex.
    Exhausted,
}

=======
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
   - No scaffolding, or no reliable static anchor → (?s)(.*) — passthrough. When unsure, prefer passthrough: capturing too much is recoverable, silently dropping the instruction is not.
   The message was sent to an agent, so it carries an instruction — a pattern that captures nothing is always wrong. If the message looks like pure scaffolding, the instruction is hiding inside one of the blocks: find it, or fall back to passthrough.
4. Narrow when the structure supports it: if the instruction region is itself structured (say, a JSON object where one field is the task), capture just that field, anchoring on its static field name.
5. Probe with try_extraction_regex whenever you are not fully certain — unusual layout, an anchor occurring more than once, any narrowing. If the probe result is wrong, rethink your segmentation and anchors. A single confident passthrough may be submitted without probing.
6. Finish with submit_extraction_regex — submitting is the only way to finish. The submitted pattern must extract non-empty text from this message; when no reliable pattern can be produced, submit the passthrough.
=======
   - Entire message is scaffolding, no instruction anywhere → (?s)() — empty capture.
   - No scaffolding, or no reliable static anchor → (?s)(.*) — passthrough. When unsure, prefer passthrough: capturing too much is recoverable, silently dropping the instruction is not.
4. Narrow when the structure supports it: if the instruction region is itself structured (say, a JSON object where one field is the task), capture just that field, anchoring on its static field name.
5. Probe with try_extraction_regex whenever you are not fully certain — unusual layout, an anchor occurring more than once, any narrowing. If the probe result is wrong, rethink your segmentation and anchors. A single confident passthrough may be submitted without probing.
6. Finish with submit_extraction_regex — submitting is the only way to finish. Submit an empty string only when no valid pattern can be produced at all; an uncertain case should be a passthrough, not an empty submit.
>>>>>>> Stashed changes

# Tools

- try_extraction_regex: probes a candidate pattern. It is applied to the ORIGINAL message (full text, separator lines included) and you get back the FINAL user-visible result: capture group 1 with the "== lmnr_part_separator ==" lines already stripped and the parts re-joined. Judge it as the end product and do not expect the separator lines in it. Every pattern — probed or submitted — always runs against the original message; never write a pattern against a probe's result text.
<<<<<<< Updated upstream
- submit_extraction_regex: submits the final pattern (starts with "(?s)", no surrounding quotes) and ends the pipeline. You may probe as many times as you want first. A submitted pattern that does not extract non-empty text from this message is rejected and returned to you — probe, fix the pattern, and submit again.
=======
- submit_extraction_regex: submits the final pattern (starts with "(?s)", no surrounding quotes) and ends the pipeline. You may probe as many times as you want first. A submitted pattern that does not match this message is rejected and returned to you — probe, fix the pattern, and submit again.
>>>>>>> Stashed changes

# Rules

- Exactly one capture group. Always prefix with (?s).
- Anchor text must appear VERBATIM in the message. Never invent markers and never copy marker names from these instructions.
- Never nest quantifiers (no (a+)+-style patterns).
- The pattern must match this message — and, because it anchors only on static text, every future message from the same template."#;

/// Agentic LLM pipeline generating one extraction regex from a single
/// sample input: the model probes candidate patterns with
/// `try_extraction_regex` (applied here, result returned to it) and
<<<<<<< Updated upstream
/// finishes with `submit_extraction_regex`. Errors only when a call
/// exhausts its transient-retry budget (timeout / provider error) — each
/// call is retried with exponential backoff (up to
/// [`LLM_RETRY_MAX_ELAPSED_SECS`] elapsed) first. Recoverable slips — a
/// response with no tool call, or a submitted pattern that doesn't
/// extract non-empty text from the sample (empty string, no compile, no
/// match, empty capture) — are pushed back to the model (a nudge / a
/// rejection tool response) and retried within the call budget. The only
/// non-error terminal outcomes are an accepted pattern
/// ([`GenerationVerdict::Pattern`]) and an exhausted budget
/// ([`GenerationVerdict::Exhausted`]).
=======
/// finishes with `submit_extraction_regex`. Errors only on timeout /
/// provider error — the genuinely transient failures the consumer may
/// requeue. Recoverable slips — a response with no tool call, or a
/// submitted pattern that doesn't match the sample — are pushed back to
/// the model (a nudge / a rejection tool response) and retried within
/// the call budget. Only an explicit empty-string submit (the model's
/// deliberate no-regex verdict) or an exhausted budget is `Ok(None)`: a
/// decision, not a transport failure.
>>>>>>> Stashed changes
pub async fn generate_extraction_regex(
    llm_client: &Arc<LlmClient>,
    sample_input: &str,
    scope: &SpanScope,
<<<<<<< Updated upstream
) -> anyhow::Result<GenerationVerdict> {
=======
) -> anyhow::Result<Option<String>> {
>>>>>>> Stashed changes
    let mut contents = vec![ProviderContent {
        role: Some("user".to_string()),
        parts: Some(vec![ProviderPart {
            text: Some(sample_input.to_string()),
            ..Default::default()
        }]),
    }];

    for _ in 0..MAX_LLM_CALLS {
        let request = build_request(contents.clone());
        let response = call_llm(llm_client, &request, scope).await?;

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
<<<<<<< Updated upstream
        // answer. Accepted means exactly one thing: a pattern whose
        // application to the sample yields `Extracted` (non-empty capture).
        // Everything else — an empty string, a missing/unparseable `regex`
        // arg (truncated or mangled tool call), a pattern that doesn't
        // compile or match, or one whose capture is empty (`(?s)()`-style
        // "no user task" verdicts) — falls through to the rejection path
        // below and the model gets another attempt within the call budget.
        // The message was sent to an agent, so it virtually always carries
        // an instruction; a capture-nothing verdict is almost never right.
=======
        // answer. Accepted means: empty string (the deliberate no-regex
        // verdict — terminal) or a pattern that matches the sample
        // (`Extracted` or `NoUserRequest`). A non-matching submit is NOT
        // accepted — it falls through to the rejection path below and the
        // model gets another attempt within the call budget.
>>>>>>> Stashed changes
        for part in parts {
            if let Some(fc) = &part.function_call
                && fc.name == SUBMIT_TOOL_NAME
            {
                let submitted = fc
                    .args
                    .as_ref()
                    .and_then(|a| a.get("regex"))
                    .and_then(|v| v.as_str())
<<<<<<< Updated upstream
                    .map(str::trim);
                if let Some(pattern) = submitted
                    && matches!(
                        apply_regex(pattern, sample_input),
                        ApplyRegexResult::Extracted(_)
                    )
                {
                    return Ok(GenerationVerdict::Pattern(pattern.to_string()));
=======
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
>>>>>>> Stashed changes
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
                    probe_extraction_regex(pattern, sample_input, scope)
                }
<<<<<<< Updated upstream
                SUBMIT_TOOL_NAME => {
                    let pattern = fc
                        .args
                        .as_ref()
                        .and_then(|a| a.get("regex"))
                        .and_then(|v| v.as_str())
                        .map(str::trim)
                        .unwrap_or("");
                    reject_submission(pattern, sample_input)
                }
=======
                SUBMIT_TOOL_NAME => serde_json::json!({
                    "result": "rejected",
                    "detail": "the submitted pattern does not match the message (no match, \
                               invalid pattern, or no capture group 1), so it was not \
                               accepted; probe with try_extraction_regex, then submit a \
                               pattern that matches",
                }),
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
                         The submitted pattern must extract non-empty text from the \
                         message; when no reliable pattern can be produced, submit the \
                         passthrough (?s)(.*)."
=======
                         Submit an empty string only if no valid pattern can be produced."
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
    Ok(GenerationVerdict::Exhausted)
}

/// Rejection tool response for a submit that wasn't accepted, telling
/// the model exactly why so its next attempt can fix the right thing.
fn reject_submission(pattern: &str, sample_input: &str) -> serde_json::Value {
    let detail = if pattern.is_empty() {
        "the `regex` argument is missing or empty; an empty submit is never accepted — \
         the message was sent to an agent, so it carries an instruction; probe with \
         try_extraction_regex, then submit a pattern that extracts it (or the \
         passthrough (?s)(.*) when no reliable anchor exists)"
    } else {
        match apply_regex(pattern, sample_input) {
            ApplyRegexResult::NoUserRequest => {
                "the submitted pattern matches but capture group 1 is empty/whitespace-only; \
                 a pattern that captures nothing is never accepted — the message was sent \
                 to an agent, so it carries an instruction; find it, or submit the \
                 passthrough (?s)(.*)"
            }
            _ => {
                "the submitted pattern does not match the message (no match, invalid \
                 pattern, or no capture group 1), so it was not accepted; probe with \
                 try_extraction_regex, then submit a pattern that extracts non-empty text"
            }
        }
    };
    serde_json::json!({ "result": "rejected", "detail": detail })
=======
    Ok(None)
>>>>>>> Stashed changes
}

/// Apply a probed pattern to the original sample input and package the
/// FINAL user-visible outcome for the model, tracing the application as
/// a tool span. The extracted text is signpost-stripped exactly like the
/// stored metadata, so the model judges the end product.
fn probe_extraction_regex(
    pattern: &str,
    sample_input: &str,
    scope: &SpanScope,
) -> serde_json::Value {
    let span = SpanBuilder::tool(scope, TRY_TOOL_NAME)
        .input(&serde_json::json!({ "regex": pattern }))
        .build();
    let result = apply_regex(pattern, sample_input);
    let response = apply_result_to_json(&result);
    self_tracing::set_output(&span, &response);
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
<<<<<<< Updated upstream
                    description: "Submit the chosen regex pattern and end the pipeline. The pattern must extract non-empty text from the message.".to_string(),
=======
                    description: "Submit the chosen regex pattern and end the pipeline, or an empty string when no valid pattern can be produced.".to_string(),
>>>>>>> Stashed changes
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "regex": {
                                "type": "string",
<<<<<<< Updated upstream
                                "description": "A regex pattern starting with (?s) with exactly one capture group."
=======
                                "description": "A regex pattern starting with (?s) with exactly one capture group. Empty string for null."
>>>>>>> Stashed changes
                            }
                        },
                        "required": ["regex"]
                    }),
                },
            ],
        }]),
        generation_config: Some(ProviderGenerationConfig {
            temperature: Some(1.0),
<<<<<<< Updated upstream
            max_output_tokens: Some(MAX_OUTPUT_TOKENS),
=======
            max_output_tokens: Some(1024),
>>>>>>> Stashed changes
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

<<<<<<< Updated upstream
/// A failed provider call: the message plus whether the failure is worth
/// retrying (timeouts and retryable provider errors are; config errors
/// and non-retryable API errors are not).
struct LlmCallError {
    message: String,
    retryable: bool,
}

/// One LLM call with conventional exponential-backoff retries for
/// transient failures (`backoff` crate, like the worker connect loop).
/// Each attempt is its own traced provider call. Errors only when the
/// retry window is exhausted or the failure is non-retryable.
=======
/// One traced provider call with a timeout. Errors (timeout / provider)
/// are the transient failures the consumer may requeue.
>>>>>>> Stashed changes
async fn call_llm(
    llm_client: &Arc<LlmClient>,
    request: &ProviderRequest,
    scope: &SpanScope,
) -> anyhow::Result<ProviderResponse> {
<<<<<<< Updated upstream
    let backoff = ExponentialBackoffBuilder::new()
        .with_initial_interval(std::time::Duration::from_secs(
            LLM_RETRY_INITIAL_BACKOFF_SECS,
        ))
        .with_max_elapsed_time(Some(std::time::Duration::from_secs(
            LLM_RETRY_MAX_ELAPSED_SECS,
        )))
        .build();

    backoff::future::retry(backoff, || async {
        call_llm_once(llm_client, request, scope)
            .await
            .map_err(|e| {
                if e.retryable {
                    log::warn!("user-task: LLM call failed, will retry: {}", e.message);
                    backoff::Error::transient(anyhow::anyhow!(e.message))
                } else {
                    backoff::Error::permanent(anyhow::anyhow!(e.message))
                }
            })
    })
    .await
}

/// One traced provider call with a timeout.
async fn call_llm_once(
    llm_client: &Arc<LlmClient>,
    request: &ProviderRequest,
    scope: &SpanScope,
) -> Result<ProviderResponse, LlmCallError> {
=======
>>>>>>> Stashed changes
    // Build the span before the call — spans can't be backdated, so a
    // span built after the call returns would record ~zero duration.
    let (model, provider) = llm_client.resolve_model_provider(request);
    let span_input = request_to_span_input(request);
    let span_tools = request_to_tools_attr(request);
    let span = SpanBuilder::llm(scope, "generate_extraction_regex")
        .input(&span_input)
        .model(&provider, &model)
        .tools(span_tools.as_ref())
        .build();

    let call = llm_client.generate_content(request);
    let timed = tokio::time::timeout(std::time::Duration::from_secs(REGEX_LLM_TIMEOUT_SECS), call);
    let result = timed.instrument(span.clone()).await;

    let (response, error) = match result {
        Ok(Ok(response)) => (Some(response), None),
<<<<<<< Updated upstream
        Ok(Err(e)) => (
            None,
            Some(LlmCallError {
                message: format!("regex generation failed: {e}"),
                retryable: e.is_retryable(),
            }),
        ),
        Err(_) => (
            None,
            Some(LlmCallError {
                message: format!("regex generation timed out after {REGEX_LLM_TIMEOUT_SECS}s"),
                retryable: true,
            }),
=======
        Ok(Err(e)) => (None, Some(format!("regex generation failed: {e}"))),
        Err(_) => (
            None,
            Some(format!(
                "regex generation timed out after {REGEX_LLM_TIMEOUT_SECS}s"
            )),
>>>>>>> Stashed changes
        ),
    };

    if let Some(response) = response.as_ref() {
        self_tracing::set_output(&span, &serde_json::json!(response.candidates));
        let usage = response.usage_metadata.as_ref();
        self_tracing::set_usage(
            &span,
            usage.and_then(|u| u.prompt_token_count),
            usage.and_then(|u| u.cache_read_input_tokens),
            usage.and_then(|u| u.candidates_token_count),
        );
    }
<<<<<<< Updated upstream
    if let Some(error) = error.as_ref() {
        self_tracing::record_error(&span, error.message.clone());
=======
    if let Some(error) = error.clone() {
        self_tracing::record_error(&span, error);
>>>>>>> Stashed changes
    }

    match (response, error) {
        (Some(response), _) => Ok(response),
<<<<<<< Updated upstream
        (None, Some(error)) => Err(error),
        (None, None) => unreachable!(),
    }
}

#[cfg(test)]
mod tests {
    use uuid::Uuid;

    use super::*;
    use crate::llm::ProviderClient;
    use crate::llm::mock::{GenerateFailureMode, MockProviderClient};

    fn mock_llm_client(mock: MockProviderClient) -> Arc<LlmClient> {
        Arc::new(LlmClient::from_provider("mock", ProviderClient::Mock(mock)))
    }

    fn test_scope() -> SpanScope {
        SpanScope::new(Uuid::new_v4(), Uuid::new_v4())
    }

    // ---- call_llm retries ---------------------------------------------------
    //
    // The retry budget is time-based (`max_elapsed_time`), which the
    // `backoff` crate measures on the real clock, so there is no
    // "gives up after N attempts" test — a fail-forever run would need
    // real minutes to exhaust the window.

    #[tokio::test(start_paused = true)]
    async fn call_llm_retries_transient_failures_until_success() {
        let mock = MockProviderClient::with_generate_failure(2, GenerateFailureMode::Retryable429);
        let counter = mock.clone();
        let client = mock_llm_client(mock);
        let request = build_request(vec![]);

        let result = call_llm(&client, &request, &test_scope()).await;
        assert!(result.is_ok());
        assert_eq!(counter.generate_call_count(), 3);
    }

    #[tokio::test(start_paused = true)]
    async fn call_llm_does_not_retry_non_retryable_failures() {
        let mock = MockProviderClient::with_generate_failure(
            usize::MAX,
            GenerateFailureMode::NonRetryable,
        );
        let counter = mock.clone();
        let client = mock_llm_client(mock);
        let request = build_request(vec![]);

        let result = call_llm(&client, &request, &test_scope()).await;
        assert!(result.is_err());
        assert_eq!(counter.generate_call_count(), 1);
    }

    // ---- reject_submission --------------------------------------------------

    fn rejection_detail(pattern: &str, sample: &str) -> String {
        let response = reject_submission(pattern, sample);
        assert_eq!(response["result"], "rejected");
        response["detail"].as_str().unwrap().to_string()
    }

    #[test]
    fn reject_submission_explains_empty_submit() {
        let detail = rejection_detail("", "some message");
        assert!(detail.contains("missing or empty"));
        assert!(detail.contains("(?s)(.*)"));
    }

    #[test]
    fn reject_submission_explains_empty_capture() {
        // Matches, but capture group 1 is empty — the old "no user task"
        // verdict, no longer accepted.
        let detail = rejection_detail(r"(?s)()", "some message");
        assert!(detail.contains("captures nothing"));
        assert!(detail.contains("(?s)(.*)"));
    }

    #[test]
    fn reject_submission_explains_no_match() {
        let detail = rejection_detail(r"(?s)<nope>(.*)", "some message");
        assert!(detail.contains("does not match"));
    }
}
=======
        (None, Some(error)) => Err(anyhow::anyhow!(error)),
        (None, None) => unreachable!(),
    }
}
>>>>>>> Stashed changes
