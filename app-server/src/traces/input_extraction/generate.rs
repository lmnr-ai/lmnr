//! The lite-LLM call that generates an extraction regex from sample
//! input, plus the prompt it runs on.

use std::sync::Arc;

use tracing::Instrument;

use super::self_tracing::{self, SpanBuilder, SpanScope};
use crate::llm::models::{
    ModelSize, ProviderContent, ProviderFunctionDeclaration, ProviderGenerationConfig,
    ProviderPart, ProviderRequest, ProviderResponse, ProviderThinkingConfig, ProviderThinkingLevel,
    ProviderTool,
};
use crate::llm::{LlmClient, parsing_provider, request_to_span_input, request_to_tools_attr};

const REGEX_LLM_TIMEOUT_SECS: u64 = 120;

const REGEX_GENERATION_SYSTEM_PROMPT: &str = r#"<role>
You write regexes that strip scaffolding wrappers from AI agent conversation messages, leaving the instruction the agent was asked to act on. Agent harnesses wrap each turn's real instruction in XML-like tags (e.g. <system-reminder>, <context>, <env>, <tool_list>, <skills>, <metadata>, or similar). Remove the wrapper; keep everything else. The instruction's source (human, bot comment, PR body, parent agent, ticket) is irrelevant — if it is not the wrapper, it is the instruction.
</role>

<core_principle>
DEFAULT IS PASSTHROUGH. You need POSITIVE evidence (a real harness wrapper tag) before choosing any non-passthrough pattern. When in any doubt, submit (?s)(.*). Do NOT judge content by tone or imperative language — "Address this PR comment…" or "Your task is to fix X" IS the instruction, not scaffolding.
</core_principle>

<procedure>
Follow these steps in order.

1. List every XML/HTML-like tag in the input and classify each:
   - HARNESS WRAPPER (may anchor on these): system-reminder, context, env, environment, tools, tool_list, instructions, skills, reminder, metadata, session, and close relatives — structured, self-contained system-injected blocks sitting at the top or bottom of the message, not mid-paragraph.
   - CONTENT (never anchor on these, even if they repeat): HTML/markdown rendering tags (h1-h6, p, br, a, div, span, code, pre, details, summary, table, img, ul, ol, li, …), HTML comments (<!-- … --> — treat them as prose, never as anchors), and any tag inside a bot comment / PR review / issue body / markdown body.
   The input may carry "== lmnr_… ==" structure markers; they are present when the regex runs but are stripped from the captured text afterwards, so treat them as layout hints, never as harness wrapper tags:
   - "== lmnr_end_of_system_prompt ==": everything BEFORE it is the system prompt — scaffolding by default; classify tags there as HARNESS WRAPPER only. If the system section is present, the capture should normally start after this marker; anchoring the pattern on the marker text itself (e.g. `(?s).*== lmnr_end_of_system_prompt ==\s*(.*)`) is allowed and is the right LEADING anchor when no wrapper tag follows it. Only when the actual user request clearly lives INSIDE the system prompt (usually delimited by a request-like tag) may the capture come from before the marker — then use the WRAPPED pattern on that tag.
   - "== lmnr_part_separator ==": separates sibling user-message parts. Never anchor on it; a capture may span it (it is removed later).

2. If no HARNESS WRAPPER tag survives → (?s)(.*). Stop. Never fall back to a content tag.

3. Otherwise pick the layout and its pattern (tag = the wrapper tag, verbatim):
   - LEADING: input STARTS with <tag>; instruction follows the LAST </tag> → (?s).*</tag>\s*(.*)
     The leading .* is mandatory — it makes the greedy engine anchor on the LAST closing tag, not the first.
   - TRAILING: instruction first, wrapper later → (?s)^(.*?)<tag>
     The ^ and LAZY (.*?) are mandatory — anchor on the FIRST opening tag. Only valid when every sample has non-trivial prose BEFORE the first <tag>; if the input starts with <tag>, the layout is LEADING, never TRAILING.
   - WRAPPED: instruction sits inside a request-like tag (<user_request>, <task>, <query>, …) present in every sample → (?s)<tag>\s*(.*?)\s*</tag>
   - ALL SCAFFOLDING: entire input is balanced wrapper tags with only whitespace outside → (?s)()
   - MIXED or unclear (scaffolding on both sides, layouts differ across samples) → (?s)(.*)

4. Mentally run the regex against the sample, including one where the anchor tag appears at least twice. An empty capture on an input that starts with the wrapper means you picked TRAILING by mistake — switch to LEADING. A capture that drops meaningful prose means you anchored on a content tag — go back to step 1.
</procedure>

<rules>
- Exactly one capture group. Always prefix with (?s).
- The anchor tag must appear VERBATIM in the input samples. Never invent tag names and never copy them from this prompt.
- Never anchor on an HTML comment marker (<!-- or -->).
- Keep the pattern simple and cheap to run: literals, character classes, .* / .*? and \s* are all you normally need. Backreferences and lookarounds are supported but almost never necessary — use them only when nothing simpler works, and never nest quantifiers (no (a+)+-style patterns).
- The regex must match every sample. If samples disagree on scaffolding tags, prefer a tag common to all, else passthrough.
</rules>

<output_format>
Call the `submit_extraction_regex` tool with the regex pattern itself (starts with "(?s)", no surrounding quotes, no fences). Use an empty string only if no valid regex can be produced — when in doubt, submit the passthrough instead.
</output_format>"#;

/// LLM call to generate one extraction regex from one (or more)
/// sample inputs. Errors only on timeout / provider error — the
/// genuinely transient failures the consumer may requeue. A response
/// that carries no usable regex (the model submitted an empty string,
/// its "no valid regex can be produced" verdict per the prompt, or no
/// tool call at all) is `Ok(None)`: a terminal decision, not a
/// transport failure.
pub async fn generate_extraction_regex(
    llm_client: &Arc<LlmClient>,
    sample_input: &str,
    tracing: Option<&SpanScope>,
) -> anyhow::Result<Option<String>> {
    let request = ProviderRequest {
        contents: vec![ProviderContent {
            role: Some("user".to_string()),
            parts: Some(vec![ProviderPart {
                text: Some(sample_input.to_string()),
                ..Default::default()
            }]),
        }],
        system_instruction: Some(ProviderContent {
            role: None,
            parts: Some(vec![ProviderPart {
                text: Some(REGEX_GENERATION_SYSTEM_PROMPT.to_string()),
                ..Default::default()
            }]),
        }),
        tools: Some(vec![ProviderTool {
            function_declarations: vec![ProviderFunctionDeclaration {
                name: "submit_extraction_regex".to_string(),
                description: "Submit the chosen regex pattern, or an empty string when no valid pattern can be produced.".to_string(),
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
            }],
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
    };

    // Build the span before the call — spans can't be backdated, so a
    // span built after the call returns would record ~zero duration.
    let (model, provider) = llm_client.resolve_model_provider(&request);
    let span_input = request_to_span_input(&request);
    let span_tools = request_to_tools_attr(&request);
    let span = tracing.map(|scope| {
        SpanBuilder::llm(scope, "generate_extraction_regex")
            .input(&span_input)
            .model(&provider, &model)
            .tools(span_tools.as_ref())
            .build()
    });

    let call = llm_client.generate_content(&request);
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
        (Some(response), _) => Ok(extract_regex_from_response(&response)),
        (None, Some(error)) => Err(anyhow::anyhow!(error)),
        (None, None) => unreachable!(),
    }
}

/// Walk a response's candidates → content → parts looking for the
/// `submit_extraction_regex` tool call's `regex` argument. Returns
/// `None` when no candidate / no matching tool call / empty regex.
fn extract_regex_from_response(response: &ProviderResponse) -> Option<String> {
    let parts = response
        .candidates
        .as_ref()
        .and_then(|c| c.first())
        .and_then(|c| c.content.as_ref())
        .and_then(|c| c.parts.as_ref())?;

    for part in parts {
        let Some(fc) = &part.function_call else {
            continue;
        };
        if fc.name != "submit_extraction_regex" {
            continue;
        }
        let Some(args) = &fc.args else {
            continue;
        };
        let raw = args.get("regex").and_then(|v| v.as_str())?;
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            return None;
        }
        return Some(trimmed.to_string());
    }
    None
}
