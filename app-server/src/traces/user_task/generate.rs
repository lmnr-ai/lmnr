//! The lite-LLM call that generates an extraction regex from sample
//! input, plus the prompt it runs on.

use std::sync::Arc;

use crate::llm::LlmClient;
use crate::llm::models::{
    ModelSize, ProviderContent, ProviderFunctionDeclaration, ProviderGenerationConfig,
    ProviderPart, ProviderRequest, ProviderResponse, ProviderThinkingConfig, ProviderThinkingLevel,
    ProviderTool,
};
use crate::llm::parsing_provider;

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
   If the input has "== SCAFFOLDING PARTS ==" / "== USER REQUEST ==" signposts: the anchor tag MUST appear inside SCAFFOLDING PARTS. A tag that only appears in USER REQUEST is payload. The "== … ==" headers are stripped before the regex runs — never reference them.

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

/// Lite-LLM call to generate one extraction regex from one (or more)
/// sample inputs. Errors only on timeout / provider error — the
/// genuinely transient failures the consumer may requeue. A response
/// that carries no usable regex (the model submitted an empty string,
/// its "no valid regex can be produced" verdict per the prompt, or no
/// tool call at all) is `Ok(None)`: a terminal decision, not a
/// transport failure — retrying it would loop the consumer through an
/// LLM call per cycle with no exit.
///
/// We force structured output via a one-tool function call rather than
/// asking for a JSON-shaped string — this avoids per-provider quirks
/// around code fences / explanation prefixes / trailing commas.
pub async fn generate_extraction_regex(
    llm_client: &Arc<LlmClient>,
    sample_input: &str,
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

    let call = llm_client.generate_content(&request);
    let response =
        tokio::time::timeout(std::time::Duration::from_secs(REGEX_LLM_TIMEOUT_SECS), call)
            .await
            .map_err(|_| {
                anyhow::anyhow!("regex generation timed out after {REGEX_LLM_TIMEOUT_SECS}s")
            })?
            .map_err(|e| anyhow::anyhow!("regex generation failed: {e}"))?;

    Ok(extract_regex_from_response(&response))
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
