//! Low-level primitives for user-task extraction: permissive message
//! parsing, structural fingerprinting, regex application, and the
//! lite-LLM call that generates an extraction regex from sample input.
//!
//! Regexes run on `fancy-regex`: the patterns are LLM-generated, and
//! while the prompt asks for simple constructs, the engine must accept
//! backreferences and lookarounds when the model produces them. A
//! backtrack limit bounds pathological patterns — hitting it degrades
//! to `NoMatch`, never hangs the worker.
//!
//! The pipeline logic (last-turn collection, winner heuristic, cache
//! keys, metadata patches) lives in the parent module; everything here
//! is stateless and independently testable.

use std::sync::{Arc, LazyLock};

use fancy_regex::{Regex, RegexBuilder};
use serde_json::Value;

use crate::llm::LlmClient;
use crate::llm::models::{
    ModelSize, ProviderContent, ProviderFunctionDeclaration, ProviderGenerationConfig,
    ProviderPart, ProviderRequest, ProviderThinkingConfig, ProviderThinkingLevel, ProviderTool,
};
use crate::llm::parsing_provider;

const REGEX_LLM_TIMEOUT_SECS: u64 = 120;
/// Hard cap on the number of characters fed to the regex engine and the
/// regex-generation LLM call — keeps pathological inputs bounded.
const REGEX_INPUT_CAP_CHARS: usize = 200_000;
/// Backtracking budget per regex application. LLM-generated patterns can
/// backtrack heavily on large inputs; exceeding the budget aborts the
/// match (treated as `NoMatch`) instead of burning CPU indefinitely.
const REGEX_BACKTRACK_LIMIT: usize = 1_000_000;

// ---------------------------------------------------------------------------
// Message roles
// ---------------------------------------------------------------------------

/// Normalized message role, folding provider aliases together.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Role {
    User,
    Assistant,
    Tool,
    System,
    /// No role / unrecognized (e.g. an OpenAI Responses `function_call`
    /// item, which is roleless).
    Other,
}

/// Map a message's `role` onto [`Role`], folding provider aliases:
/// `human`→User, `ai`/`model`→Assistant, `developer`→System.
pub fn normalize_role(msg: &Value) -> Role {
    match msg.get("role").and_then(Value::as_str) {
        Some("user") | Some("human") => Role::User,
        Some("assistant") | Some("ai") | Some("model") => Role::Assistant,
        Some("system") | Some("developer") => Role::System,
        Some("tool") => Role::Tool,
        _ => Role::Other,
    }
}

// ---------------------------------------------------------------------------
// Message-array discovery & part collection
// ---------------------------------------------------------------------------

pub(super) fn find_messages_array(input: &Value) -> Option<&Vec<Value>> {
    match input {
        Value::Array(arr) => Some(arr),
        Value::Object(map) => {
            // `messages` covers OpenAI/Anthropic SDK wrappers, `contents`
            // covers Gemini, `input` covers a few normalisers that wrap
            // an inner array. First match wins.
            for key in ["messages", "contents", "input"] {
                if let Some(Value::Array(arr)) = map.get(key) {
                    return Some(arr);
                }
            }
            None
        }
        _ => None,
    }
}

pub(super) fn collect_message_parts(msg: &Value) -> Vec<String> {
    // GenAI uses `parts:`; everyone else uses `content:`. A few payloads
    // carry both — prefer `content` since it's the OpenAI/Anthropic
    // canonical field.
    let Some(body) = msg.get("content").or_else(|| msg.get("parts")) else {
        return Vec::new();
    };
    parts_from_body(body)
}

fn parts_from_body(body: &Value) -> Vec<String> {
    match body {
        Value::String(s) => vec![s.clone()],
        Value::Array(arr) => arr
            .iter()
            .filter_map(render_part)
            .filter(|s| !s.is_empty())
            .collect(),
        Value::Object(_) => render_part(body).into_iter().collect(),
        _ => Vec::new(),
    }
}

fn render_part(part: &Value) -> Option<String> {
    match part {
        Value::String(s) => Some(s.clone()),
        Value::Object(obj) => {
            // Text-part conventions in the wild:
            //   - `{type: "text", text: "..."}`               OpenAI / Anthropic
            //   - `{type: "text", content: "..."}`            OTel GenAI semconv
            //   - `{type: "input_text"|"output_text", text}`  OpenAI Responses
            //
            // Treat parts with no `type` as text (defensive — lets a
            // `{text: "..."}` or `{content: "..."}` part still match).
            let kind = obj.get("type").and_then(Value::as_str);
            match kind {
                None | Some("text") => obj
                    .get("text")
                    .or_else(|| obj.get("content"))
                    .and_then(Value::as_str)
                    .map(String::from),
                Some("input_text") | Some("output_text") => {
                    obj.get("text").and_then(Value::as_str).map(String::from)
                }
                _ => None,
            }
        }
        _ => None,
    }
}

/// The message extraction anchors on: a user turn carrying at least one
/// non-empty text part.
pub(super) fn is_task_anchor_message(msg: &Value) -> bool {
    normalize_role(msg) == Role::User
        && collect_message_parts(msg)
            .iter()
            .any(|p| !p.trim().is_empty())
}

pub(super) fn truncate_for_regex(mut text: String) -> String {
    if let Some((byte_pos, _)) = text.char_indices().nth(REGEX_INPUT_CAP_CHARS) {
        text.truncate(byte_pos);
    }
    text
}

// ---------------------------------------------------------------------------
// Regex application
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ApplyRegexResult {
    /// Regex matched and the (trimmed) capture group is non-empty.
    Extracted(String),
    /// Regex matched but the capture is empty/whitespace-only — the
    /// input is pure scaffolding with no actual user request.
    NoUserRequest,
    /// Regex did not compile, did not match, exceeded the backtrack
    /// budget, or had no capture group 1.
    NoMatch,
}

/// Apply an LLM-generated pattern (e.g. `(?s).*</wrapper>\s*(.*)`) to
/// the joined user text and return the trimmed contents of the first
/// capture group.
pub fn apply_regex(pattern: &str, text: &str) -> ApplyRegexResult {
    let regex = match RegexBuilder::new(pattern)
        .backtrack_limit(REGEX_BACKTRACK_LIMIT)
        .build()
    {
        Ok(r) => r,
        Err(_) => return ApplyRegexResult::NoMatch,
    };
    let captured = match regex.captures(text) {
        Ok(Some(captures)) => match captures.get(1) {
            Some(m) => m.as_str(),
            None => return ApplyRegexResult::NoMatch,
        },
        // `Err` here is a runtime abort (backtrack limit) — same outcome
        // as not matching.
        Ok(None) | Err(_) => return ApplyRegexResult::NoMatch,
    };
    let trimmed = captured.trim();
    if trimmed.is_empty() {
        ApplyRegexResult::NoUserRequest
    } else {
        ApplyRegexResult::Extracted(trimmed.to_string())
    }
}

// ---------------------------------------------------------------------------
// Fingerprinting
// ---------------------------------------------------------------------------

/// Balanced top-level XML-like tag: `<name ...>lazy body</name>`. The
/// `\1` backreference pairs the closing tag with the opening one.
static TOP_LEVEL_TAG: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"<([a-zA-Z_][\w-]*)\b[^>]*>[\s\S]*?</\1\s*>").unwrap());

/// Structural fingerprint of a user message: the sequence of top-level
/// XML-like tags (nested tags are swallowed by the lazy body match), or
/// `"plain"` for messages with no balanced tags. Used as part of the
/// regex cache key so traces with the same scaffolding shape share a
/// cached regex.
pub fn fingerprint_user_message(input: &str) -> String {
    let mut parts: Vec<String> = Vec::new();
    let mut rest = input;

    while !rest.is_empty() {
        // A match error (backtrack limit on adversarial input) is treated
        // like "no more tags" — the remainder collapses to "plain".
        let Ok(Some(captures)) = TOP_LEVEL_TAG.captures(rest) else {
            if !rest.trim().is_empty() {
                parts.push("plain".to_string());
            }
            break;
        };
        let matched = captures.get(0).unwrap();
        if !rest[..matched.start()].trim().is_empty() {
            parts.push("plain".to_string());
        }
        let name = captures.get(1).unwrap().as_str().to_lowercase();
        parts.push(name.clone());
        parts.push(format!("/{name}"));
        rest = &rest[matched.end()..];
    }

    // Collapse adjacent "plain" entries so two consecutive prose runs
    // don't produce a different fingerprint.
    let mut deduped: Vec<String> = Vec::with_capacity(parts.len());
    for p in parts {
        if p == "plain" && deduped.last().map(String::as_str) == Some("plain") {
            continue;
        }
        deduped.push(p);
    }

    if deduped.is_empty() {
        "plain".to_string()
    } else {
        deduped.join(",")
    }
}

// ---------------------------------------------------------------------------
// LLM call — generate the extraction regex
// ---------------------------------------------------------------------------

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
fn extract_regex_from_response(response: &crate::llm::models::ProviderResponse) -> Option<String> {
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

#[cfg(test)]
mod tests {
    use super::*;

    // ---- apply_regex --------------------------------------------------------

    #[test]
    fn apply_regex_extracts_capture_group_one() {
        assert_eq!(
            apply_regex(r"(?s).*</env>\s*(.*)", "<env>x</env>\n  do the thing  "),
            ApplyRegexResult::Extracted("do the thing".to_string())
        );
    }

    #[test]
    fn apply_regex_empty_capture_is_no_user_request() {
        assert_eq!(
            apply_regex(r"(?s).*</env>\s*(.*)", "<env>x</env>   "),
            ApplyRegexResult::NoUserRequest
        );
        assert_eq!(
            apply_regex(r"(?s)()", "<env>x</env>"),
            ApplyRegexResult::NoUserRequest
        );
    }

    #[test]
    fn apply_regex_no_match_cases() {
        // No match at all.
        assert_eq!(
            apply_regex(r"(?s)^(.*?)<wrapper>", "no wrapper here"),
            ApplyRegexResult::NoMatch
        );
        // Invalid pattern.
        assert_eq!(apply_regex(r"(?s)((", "text"), ApplyRegexResult::NoMatch);
        // No capture group 1.
        assert_eq!(apply_regex(r"(?s).*", "text"), ApplyRegexResult::NoMatch);
    }

    #[test]
    fn apply_regex_supports_backreferences_and_lookarounds() {
        // Named group + backreference pairs the closing tag with the
        // opening one; the instruction stays capture group 1.
        assert_eq!(
            apply_regex(
                r"(?s)^(?:<(?<t>\w+)>.*?</\k<t>>\s*)+(.*)",
                "<ctx>a</ctx>\n<ctx>b</ctx>\nreal ask"
            ),
            // Group 1 is the named `t` group ("ctx") — the point is that
            // the engine accepts the syntax and matches; the group-1
            // contract is the prompt's job.
            ApplyRegexResult::Extracted("ctx".to_string())
        );
        // Lookahead: capture everything before the trailing wrapper.
        assert_eq!(
            apply_regex(r"(?s)^(.*?)(?=<footer>)", "the task<footer>f</footer>"),
            ApplyRegexResult::Extracted("the task".to_string())
        );
    }

    #[test]
    fn apply_regex_backtrack_limit_degrades_to_no_match() {
        // Classic catastrophic backtracking: nested quantifiers against a
        // non-matching tail. Must return NoMatch, not hang.
        let text = format!("{}!", "a".repeat(60));
        assert_eq!(
            apply_regex(r"(?s)^(?:a+)+b(.*)", &text),
            ApplyRegexResult::NoMatch
        );
    }

    // ---- fingerprint_user_message -------------------------------------------

    #[test]
    fn fingerprint_plain_text() {
        assert_eq!(fingerprint_user_message("just some prose"), "plain");
        assert_eq!(fingerprint_user_message("   "), "plain");
    }

    #[test]
    fn fingerprint_tag_sequences() {
        assert_eq!(fingerprint_user_message("<env>x</env>"), "env,/env");
        assert_eq!(
            fingerprint_user_message("<env>x</env>do this<ctx>y</ctx>"),
            "env,/env,plain,ctx,/ctx"
        );
        assert_eq!(
            fingerprint_user_message("before <reminder a=\"1\">r</reminder> after"),
            "plain,reminder,/reminder,plain"
        );
    }

    #[test]
    fn fingerprint_nested_tags_are_swallowed() {
        assert_eq!(
            fingerprint_user_message("<outer><inner>x</inner></outer>"),
            "outer,/outer"
        );
    }

    #[test]
    fn fingerprint_unbalanced_tag_collapses_to_plain() {
        assert_eq!(fingerprint_user_message("<env>never closed"), "plain");
        assert_eq!(fingerprint_user_message("stray </env> close"), "plain");
    }

    #[test]
    fn fingerprint_lowercases_and_dedupes_adjacent_plain() {
        assert_eq!(fingerprint_user_message("<ENV>x</ENV>"), "env,/env");
        // Prose on both sides of an unmatched region stays one "plain".
        assert_eq!(fingerprint_user_message("a <br oken b"), "plain");
    }
}
