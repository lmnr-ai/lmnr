//! The agentic lite-LLM pipeline that generates an extraction spec from
//! sample input, plus the prompt it runs on.
//!
//! The model gets two tools: `try_extraction_regex` probes a candidate
//! spec (we apply it to the ORIGINAL sample input and return the final
//! user-visible result), `submit_extraction_regex` ends the pipeline. The
//! model may probe as many times as it wants within the call budget.

use std::sync::Arc;

use tracing::Instrument;

use super::regex::{
    ApplyRegexResult, ExtractionSpec, apply_outcome_to_json, apply_spec, validate_spec,
};
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

You are shown ONE message that was sent as input to an AI agent. Produce an extraction spec — a mode plus regex patterns — that isolates the instruction the agent was asked to carry out and discards everything the harness injected around it.

# The template model

Messages like this one are produced by templates. A harness takes an instruction (written by a person, a parent agent, a ticket, a bot) and assembles the final message by inserting it — together with injected material such as environment info, file contents, tool inventories, reminders, and metadata — into a fixed layout.

Every piece of the message is one of two kinds of text:
- STATIC text comes from the template and recurs verbatim in every message built from it: section delimiters, tag names, labels, headers, boilerplate sentences.
- VARIABLE text differs per message: the instruction itself, and the injected data.

Your spec will be cached and re-applied to future messages from the same template. Those messages share the static text but carry entirely different variable text, so the patterns must anchor ONLY on static text. Anchoring on any of this message's variable text (its specific words, names, data) makes the spec fail or mis-extract on the very next message.

# What scaffolding looks like

Injected blocks are delimited in whatever syntax the harness happened to pick, and the syntax itself carries no meaning. XML-like tags, delimiter lines ("=== ENVIRONMENT ==="), markdown headings, ALL-CAPS labels, bracketed section headers, and JSON envelopes all play the same role. Classify every marker by its FUNCTION — does it delimit injected material, or the instruction? — never by its syntax.

Beware markup living INSIDE variable text: HTML or markdown inside a quoted PR body, bot comment, or pasted document is part of the instruction's content, not scaffolding, even when it looks tag-like. HTML comments (<!-- … -->) are never anchors. The instruction's source is irrelevant — if a block is not harness-injected, it is the instruction.

The message may carry "== lmnr_part_separator ==" lines separating sibling message parts. They are present when your regex runs and are stripped from the captured text afterwards.

# Two modes

A spec is `{mode, patterns}`. The two modes isolate the same instruction from opposite directions:

- KEEP — one pattern with exactly one capture group; group 1 is the instruction. It anchors on the instruction's POSITION: the static text immediately around the instruction region.
- REMOVE — a list of 1-8 patterns with NO capture groups. Every match of every pattern is deleted from the message and whatever remains (trimmed) is the instruction. Each pattern anchors ONE KIND of injected block INDEPENDENTLY, by that block's own delimiters.

Choose by the shape of the message, specifically by which anchors survive template variation:

- Use KEEP when the instruction occupies one contiguous region whose surrounding static text sits at a reliable position (start, end, or a fixed envelope). This is the DEFAULT — most messages fit it, and it is the safer mode when either would work.
- Use REMOVE only when position-based anchoring is unreliable but the injected blocks are individually well-delimited — static text on BOTH sides of each block. Typical signs: injected blocks whose number, order, or position can vary between messages; scaffolding interleaved with the instruction so no single contiguous capture exists; bare instruction text mixed between self-delimited blocks. If the injected blocks are NOT cleanly delimited on both sides, REMOVE is off the table — fall back to KEEP or passthrough.

Never mix strategies: the spec is either one keep pattern or a list of remove patterns.

# Procedure

1. Segment the message: which blocks are harness-injected, and which text is the instruction — the request, question, or task description someone actually wrote for this specific message?
2. Choose the mode by the shape rules above. Confirm every anchor you plan to use would appear unchanged in a different message from this harness; if it is this message's content, it cannot anchor.
3. KEEP — write one pattern with exactly one capture group around the instruction. Recurring layouts:
   - Scaffolding first, instruction last → (?s).*STATIC_END\s*(.*) — the leading greedy .* is mandatory: it anchors on the LAST occurrence of STATIC_END, not the first.
   - Instruction first, scaffolding after → (?s)^(.*?)STATIC_START — the ^ plus LAZY (.*?) are mandatory: they anchor on the FIRST occurrence of STATIC_START. Only valid when the message does not begin with scaffolding.
   - Instruction inside its own envelope → (?s)ENVELOPE_START\s*(.*?)\s*ENVELOPE_END.
   - Entire message is scaffolding, no instruction anywhere → (?s)() — empty capture.
   - No scaffolding, or no reliable static anchor → (?s)(.*) — passthrough. When unsure, prefer passthrough: capturing too much is recoverable, silently dropping the instruction is not.
4. REMOVE — write one pattern per kind of injected block. Each pattern spans one whole block from its static opening delimiter to its static closing delimiter, with a LAZY quantifier between them (for example (?s)OPEN.*?CLOSE — a greedy .* would swallow the instruction between two blocks). No capture groups anywhere; group only with (?:…). Patterns are applied in order, each against the text already reduced by the previous ones.
5. Narrow when the structure supports it: if the instruction region is itself structured (say, a JSON object where one field is the task), capture just that field, anchoring on its static field name.
6. Probe with try_extraction_regex whenever you are not fully certain — unusual layout, an anchor occurring more than once, any narrowing, and EVERY remove spec. If the probe result is wrong, rethink your segmentation, mode, and anchors. A single confident keep passthrough may be submitted without probing.
7. Finish with submit_extraction_regex — submitting is the only way to finish. Submit an empty patterns list only when no valid spec can be produced at all; an uncertain case should be a keep passthrough, not an empty submit.

# Tools

Both tools take the same spec: `mode` ("keep" or "remove") and `patterns` (keep: exactly one pattern with exactly one capture group; remove: 1-8 patterns with no capture groups).

- try_extraction_regex: probes a candidate spec. It is applied to the ORIGINAL message (full text, separator lines included) and you get back the FINAL user-visible result — WHAT REMAINS as the extracted instruction after the spec is applied, with the "== lmnr_part_separator ==" lines already stripped and the parts re-joined. In keep mode that is capture group 1; in remove mode it is the message with every match deleted, plus `patterns_matched`: how many times each of your patterns matched, in order — a 0 means that pattern is dead weight and must be fixed or dropped. Judge the result as the end product and do not expect the separator lines in it. Every spec — probed or submitted — always runs against the original message; never write a pattern against a probe's result text.
- submit_extraction_regex: submits the final spec and ends the pipeline. You may probe as many times as you want first. A submitted spec that produces nothing on this message (keep: pattern does not match; remove: not a single pattern matches) is rejected and returned to you — probe, fix the spec, and submit again.

# Rules

- Always prefix every pattern with (?s).
- keep mode: exactly one pattern, exactly one capture group. remove mode: 1-8 patterns, zero capture groups (group with (?:…)).
- Anchor text must appear VERBATIM in the message. Never invent markers and never copy marker names from these instructions.
- Never nest quantifiers (no (a+)+-style patterns).
- The spec must produce a result on this message — and, because it anchors only on static text, on every future message from the same template."#;

/// Agentic LLM pipeline generating one extraction spec from a single
/// sample input: the model probes candidate specs with
/// `try_extraction_regex` (applied here, result returned to it) and
/// finishes with `submit_extraction_regex`. Errors only on timeout /
/// provider error — the genuinely transient failures the consumer may
/// requeue. Recoverable slips — a response with no tool call, malformed
/// spec args, or a submitted spec that produces nothing on the sample —
/// are pushed back to the model (a nudge / a rejection tool response)
/// and retried within the call budget. Only an explicit empty submit
/// (the model's deliberate no-spec verdict) or an exhausted budget is
/// `Ok(None)`: a decision, not a transport failure.
pub async fn generate_extraction_spec(
    llm_client: &Arc<LlmClient>,
    sample_input: &str,
    tracing: Option<&SpanScope>,
) -> anyhow::Result<Option<ExtractionSpec>> {
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
        // answer. Accepted means: an empty patterns list (the deliberate
        // no-spec verdict — terminal) or a valid spec that produces a
        // result on the sample (`Extracted` or `NoUserRequest`). A
        // malformed or nothing-producing submit is NOT accepted — it
        // falls through to the rejection path below and the model gets
        // another attempt within the call budget.
        for part in parts {
            if let Some(fc) = &part.function_call
                && fc.name == SUBMIT_TOOL_NAME
            {
                match parse_spec_args(fc.args.as_ref()) {
                    Ok(None) => return Ok(None),
                    Ok(Some(spec)) => {
                        if validate_spec(&spec).is_ok()
                            && !matches!(
                                apply_spec(&spec, sample_input).result,
                                ApplyRegexResult::NoMatch
                            )
                        {
                            return Ok(Some(spec));
                        }
                    }
                    Err(_) => {}
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
                // Always against the ORIGINAL sample input — the prompt
                // promises probes never chain off each other's results.
                TRY_TOOL_NAME => match checked_spec(fc.args.as_ref()) {
                    Ok(spec) => probe_extraction_spec(&spec, sample_input, tracing),
                    Err(detail) => serde_json::json!({
                        "result": "error",
                        "detail": detail,
                    }),
                },
                SUBMIT_TOOL_NAME => match checked_spec(fc.args.as_ref()) {
                    // A well-formed spec reaching this arm produced nothing
                    // on the sample (the accepted-submit scan above would
                    // have ended the pipeline otherwise).
                    Ok(_) => serde_json::json!({
                        "result": "rejected",
                        "detail": "the submitted spec produces nothing on the message \
                                   (keep: the pattern does not match; remove: not a \
                                   single pattern matches), so it was not accepted; \
                                   probe with try_extraction_regex, then submit a spec \
                                   that produces a result",
                    }),
                    Err(detail) => serde_json::json!({
                        "result": "rejected",
                        "detail": detail,
                    }),
                },
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
                        "Respond with a tool call: probe a candidate spec with \
                         try_extraction_regex, or finish with submit_extraction_regex. \
                         Submit an empty patterns list only if no valid spec can be \
                         produced."
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
        "user-task: spec generation exhausted its {MAX_LLM_CALLS}-call budget without a submit"
    );
    Ok(None)
}

/// Parse `{mode, patterns}` tool args into a spec. `Ok(None)` is the
/// deliberate no-spec verdict: an explicitly empty patterns list. `Err`
/// carries a model-facing description of what is malformed.
fn parse_spec_args(args: Option<&serde_json::Value>) -> Result<Option<ExtractionSpec>, String> {
    let args = args.ok_or("missing tool arguments; pass `mode` and `patterns`")?;
    let mode = args
        .get("mode")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .ok_or("missing `mode`; pass \"keep\" or \"remove\"")?;
    let patterns: Vec<String> = args
        .get("patterns")
        .and_then(|v| v.as_array())
        .ok_or("missing `patterns`; pass an array of pattern strings")?
        .iter()
        .map(|v| {
            v.as_str()
                .map(|s| s.trim().to_string())
                .ok_or("`patterns` must contain only strings")
        })
        .collect::<Result<_, _>>()?;
    match mode {
        "keep" => match <[String; 1]>::try_from(patterns) {
            Ok([pattern]) if pattern.is_empty() => Ok(None),
            Ok([pattern]) => Ok(Some(ExtractionSpec::Keep(pattern))),
            Err(patterns) if patterns.is_empty() => Ok(None),
            Err(patterns) => Err(format!(
                "keep mode requires exactly one pattern; got {}",
                patterns.len()
            )),
        },
        "remove" => {
            if patterns.is_empty() {
                Ok(None)
            } else if patterns.iter().any(|p| p.is_empty()) {
                Err("remove patterns must be non-empty strings".to_string())
            } else {
                Ok(Some(ExtractionSpec::Remove(patterns)))
            }
        }
        other => Err(format!(
            "unknown mode `{other}`; pass \"keep\" or \"remove\""
        )),
    }
}

/// Parse AND validate spec tool args, folding "explicitly empty" into an
/// error — probes and the rejection path need a usable spec, and only
/// the accepted-submit scan treats emptiness as the no-spec verdict.
fn checked_spec(args: Option<&serde_json::Value>) -> Result<ExtractionSpec, String> {
    let spec = parse_spec_args(args)?.ok_or(
        "the patterns list is empty; an empty submit is the deliberate \
         no-spec verdict and cannot be probed",
    )?;
    validate_spec(&spec)?;
    Ok(spec)
}

/// Apply a probed spec to the original sample input and package the
/// FINAL user-visible outcome for the model, tracing the application as
/// a tool span. The extracted text is signpost-stripped exactly like the
/// stored metadata, so the model judges the end product; remove probes
/// also carry the per-pattern match counts.
fn probe_extraction_spec(
    spec: &ExtractionSpec,
    sample_input: &str,
    tracing: Option<&SpanScope>,
) -> serde_json::Value {
    let span = tracing.map(|scope| {
        SpanBuilder::tool(scope, TRY_TOOL_NAME)
            .input(&super::regex::spec_to_json(spec))
            .build()
    });
    let outcome = apply_spec(spec, sample_input);
    let response = apply_outcome_to_json(&outcome);
    if let Some(span) = span.as_ref() {
        self_tracing::set_output(span, &response);
    }
    response
}

/// The shared `{mode, patterns}` schema of both tools. The 1-8 remove
/// bound mirrors `MAX_REMOVE_PATTERNS` — keep them in sync.
fn spec_parameters_schema() -> serde_json::Value {
    serde_json::json!({
        "type": "object",
        "properties": {
            "mode": {
                "type": "string",
                "enum": ["keep", "remove"],
                "description": "keep: capture the instruction. remove: delete every injected block so the instruction is what remains."
            },
            "patterns": {
                "type": "array",
                "items": { "type": "string" },
                "description": "Regex patterns, each starting with (?s). keep: exactly one pattern with exactly one capture group. remove: 1-8 patterns with no capture groups ((?:…) for grouping). Empty list only on submit, as the no-spec verdict."
            }
        },
        "required": ["mode", "patterns"]
    })
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
                    description: "Probe a candidate extraction spec: it is applied to the ORIGINAL input and the final user-visible extraction result (what remains as the instruction) is returned; remove mode also returns per-pattern match counts. Call as many times as needed before submitting.".to_string(),
                    parameters: spec_parameters_schema(),
                },
                ProviderFunctionDeclaration {
                    name: SUBMIT_TOOL_NAME.to_string(),
                    description: "Submit the chosen extraction spec and end the pipeline, or an empty patterns list when no valid spec can be produced.".to_string(),
                    parameters: spec_parameters_schema(),
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

#[cfg(test)]
mod tests {
    use super::*;

    fn args(v: serde_json::Value) -> Option<serde_json::Value> {
        Some(v)
    }

    #[test]
    fn parse_spec_args_keep_and_remove() {
        assert_eq!(
            parse_spec_args(
                args(serde_json::json!({"mode": "keep", "patterns": ["(?s)(.*)"]})).as_ref()
            ),
            Ok(Some(ExtractionSpec::Keep("(?s)(.*)".to_string())))
        );
        assert_eq!(
            parse_spec_args(
                args(serde_json::json!({"mode": "remove", "patterns": ["a", "b"]})).as_ref()
            ),
            Ok(Some(ExtractionSpec::Remove(vec![
                "a".to_string(),
                "b".to_string()
            ])))
        );
    }

    #[test]
    fn parse_spec_args_empty_is_no_spec_verdict() {
        // Empty patterns list — and, for keep, a single empty string
        // (the legacy shape of the verdict) — both mean "no spec".
        for mode in ["keep", "remove"] {
            assert_eq!(
                parse_spec_args(args(serde_json::json!({"mode": mode, "patterns": []})).as_ref()),
                Ok(None)
            );
        }
        assert_eq!(
            parse_spec_args(args(serde_json::json!({"mode": "keep", "patterns": [""]})).as_ref()),
            Ok(None)
        );
    }

    #[test]
    fn parse_spec_args_malformed_is_err() {
        assert!(parse_spec_args(None).is_err());
        assert!(parse_spec_args(args(serde_json::json!({"patterns": ["a"]})).as_ref()).is_err());
        assert!(parse_spec_args(args(serde_json::json!({"mode": "keep"})).as_ref()).is_err());
        assert!(
            parse_spec_args(args(serde_json::json!({"mode": "both", "patterns": ["a"]})).as_ref())
                .is_err()
        );
        // keep with more than one pattern.
        assert!(
            parse_spec_args(
                args(serde_json::json!({"mode": "keep", "patterns": ["(a)", "(b)"]})).as_ref()
            )
            .is_err()
        );
        // Non-string pattern entries.
        assert!(
            parse_spec_args(
                args(serde_json::json!({"mode": "remove", "patterns": ["a", 1]})).as_ref()
            )
            .is_err()
        );
        // remove with an empty-string pattern is malformed, not a verdict.
        assert!(
            parse_spec_args(
                args(serde_json::json!({"mode": "remove", "patterns": ["a", ""]})).as_ref()
            )
            .is_err()
        );
    }

    #[test]
    fn checked_spec_validates_and_rejects_verdict() {
        assert!(
            checked_spec(
                args(serde_json::json!({"mode": "keep", "patterns": ["(?s)(.*)"]})).as_ref()
            )
            .is_ok()
        );
        // Structurally fine but semantically invalid: keep without a group.
        assert!(
            checked_spec(
                args(serde_json::json!({"mode": "keep", "patterns": ["(?s).*"]})).as_ref()
            )
            .is_err()
        );
        // The no-spec verdict is not probeable.
        assert!(
            checked_spec(args(serde_json::json!({"mode": "keep", "patterns": []})).as_ref())
                .is_err()
        );
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
