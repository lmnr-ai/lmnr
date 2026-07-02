//! Low-level primitives for user-task extraction: permissive message
//! parsing, structural fingerprinting, RE2 regex application, and the
//! lite-LLM call that generates an extraction regex from sample input.
//!
//! The pipeline logic (last-turn collection, winner heuristic, cache
//! keys, metadata patches) lives in the parent module; everything here
//! is stateless and independently testable.

use std::sync::Arc;

use regex::Regex;
use serde_json::Value;

use crate::llm::LlmClient;
use crate::llm::models::{
    ModelSize, ProviderContent, ProviderFunctionDeclaration, ProviderGenerationConfig,
    ProviderPart, ProviderRequest, ProviderThinkingConfig, ProviderThinkingLevel, ProviderTool,
};
use crate::llm::{parsing_provider, request_to_tools_attr};

const REGEX_LLM_TIMEOUT_SECS: u64 = 120;
/// Hard cap on the number of characters fed to the regex engine and the
/// regex-generation LLM call — keeps pathological inputs bounded.
const REGEX_INPUT_CAP_CHARS: usize = 200_000;

/// Side-channel metadata describing the regex-generation LLM call
/// (model / tokens / output / error), so the caller can log or
/// instrument the call without owning provider specifics. Only `error`
/// is consumed today; the rest is populated for observability hooks.
#[allow(dead_code)]
#[derive(Debug, Clone)]
pub struct PreviewLlmCall {
    /// Resolved model id (from `LlmClient::resolve_model_provider`).
    pub model: String,
    /// Resolved provider id (e.g. `"bedrock"` / `"gemini"`).
    pub provider: String,
    /// JSON-shaped response. `None` on error/timeout.
    pub output: Option<serde_json::Value>,
    /// Tools attribute (matches `crate::llm::request_to_tools_attr`).
    pub tools: Option<serde_json::Value>,
    pub input_tokens: Option<i32>,
    pub input_cached_tokens: Option<i32>,
    pub output_tokens: Option<i32>,
    /// Provider-side error message, if any.
    pub error: Option<String>,
}

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

pub(super) fn truncate_for_regex(text: &str) -> String {
    let mut out = String::new();
    let mut count = 0usize;
    for c in text.chars() {
        if count >= REGEX_INPUT_CAP_CHARS {
            break;
        }
        out.push(c);
        count += 1;
    }
    out
}

// ---------------------------------------------------------------------------
// Regex application (RE2 via the `regex` crate)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ApplyRegexResult {
    /// Regex matched and the (trimmed) capture group is non-empty.
    Extracted(String),
    /// Regex matched but the capture is empty/whitespace-only — the
    /// input is pure scaffolding with no actual user request.
    NoUserRequest,
    /// Regex did not compile, did not match, or had no capture group 1.
    NoMatch,
}

/// Apply a re2-style pattern (e.g. `(?s).*</wrapper>\s*(.*)`) to the
/// joined user text and return the trimmed contents of the first
/// capture group. The `regex` crate is RE2-compatible, so patterns that
/// the LLM generates from the frontend prompt (which restricts itself
/// to RE2 syntax) work as-is.
pub fn apply_regex(pattern: &str, text: &str) -> ApplyRegexResult {
    let regex = match Regex::new(pattern) {
        Ok(r) => r,
        Err(_) => return ApplyRegexResult::NoMatch,
    };
    let captures = match regex.captures(text) {
        Some(c) => c,
        None => return ApplyRegexResult::NoMatch,
    };
    let captured = match captures.get(1) {
        Some(m) => m.as_str(),
        None => return ApplyRegexResult::NoMatch,
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

/// Structural fingerprint of a user message: sequence of top-level
/// XML-like tags (nested tags ignored), or `"plain"` for messages with
/// no tags. Used as part of the regex cache key so traces with the same
/// scaffolding shape share a cached regex.
///
/// Mirrors `fingerprintUserMessage` in
/// `frontend/lib/actions/sessions/extract-input.ts`. The frontend uses
/// a JS regex with a `\1` backreference to pair `<name>` with the
/// matching `</name>`; the Rust `regex` crate is RE2-compatible and
/// has no backreferences, so we walk the string manually instead.
/// Behaviour mirrors the JS version: on each iteration, find the next
/// opening tag and search for its specific closing tag (lazy / first
/// match wins).
pub fn fingerprint_user_message(input: &str) -> String {
    let mut parts: Vec<String> = Vec::new();
    let mut rest = input;

    while !rest.is_empty() {
        let Some(open) = find_next_open_tag(rest) else {
            if !rest.trim().is_empty() {
                parts.push("plain".to_string());
            }
            break;
        };

        let before = &rest[..open.start];
        let after_open = &rest[open.tag_end..];
        let close_pattern = format!("</{}", open.name);
        let Some(close_rel) = find_matching_close(after_open, &close_pattern) else {
            // Open tag with no matching close — treat the whole
            // remaining input as plain prose. Frontend behaves the
            // same way: an unmatched `<name>` doesn't produce a tag
            // entry, so the leftover collapses to "plain".
            if !rest.trim().is_empty() {
                parts.push("plain".to_string());
            }
            break;
        };

        if !before.trim().is_empty() {
            parts.push("plain".to_string());
        }
        let lower = open.name.to_lowercase();
        parts.push(lower.clone());
        parts.push(format!("/{}", lower));

        rest = &after_open[close_rel..];
    }

    // Collapse adjacent "plain" entries — frontend dedupes the same way
    // so two consecutive plain runs separated by whitespace don't
    // produce a different fingerprint.
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

#[derive(Debug)]
struct OpenTag {
    /// Byte offset of the leading `<` in the source slice.
    start: usize,
    /// Byte offset just past the closing `>` of the opening tag.
    tag_end: usize,
    /// Tag name (preserving original casing — caller lowercases).
    name: String,
}

/// Find the next opening tag in `text`. The opening tag must start with
/// `<` followed by an XML-like name (`[a-zA-Z_][\w-]*`), followed by
/// either whitespace, `/` (self-close), or `>`. Self-closing tags
/// (`<br/>`) and processing instructions (`<?xml ... ?>`) are skipped —
/// we move past their `>` and keep scanning.
fn find_next_open_tag(text: &str) -> Option<OpenTag> {
    let bytes = text.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] != b'<' {
            i += 1;
            continue;
        }
        // Skip closing tags `</...>`, comments `<!--...`, and PIs `<?...?>`
        // — none of these are openings we want to anchor on.
        let next = bytes.get(i + 1).copied();
        if next == Some(b'/') || next == Some(b'!') || next == Some(b'?') {
            // Advance past this `>` if we can find one; else bail.
            match memchr_byte(b'>', &bytes[i..]) {
                Some(off) => i += off + 1,
                None => return None,
            }
            continue;
        }
        // Try to read a tag name. Must start with letter or `_`.
        let start_name = i + 1;
        if !is_name_start(bytes.get(start_name).copied()) {
            i += 1;
            continue;
        }
        let mut end_name = start_name + 1;
        while end_name < bytes.len() && is_name_char(bytes[end_name]) {
            end_name += 1;
        }
        // Must be followed by whitespace, `/`, or `>` (otherwise it's
        // not actually a tag — e.g. `<not-a-tag~with~tildes>`).
        let valid_terminator = match bytes.get(end_name).copied() {
            Some(b'>') | Some(b'/') => true,
            Some(c) if c.is_ascii_whitespace() => true,
            _ => false,
        };
        if !valid_terminator {
            i = end_name;
            continue;
        }
        // Find the `>` that closes this opening.
        let close_off = match memchr_byte(b'>', &bytes[end_name..]) {
            Some(o) => o,
            None => return None,
        };
        let tag_end = end_name + close_off + 1;
        // Self-closing? skip it and keep scanning.
        if tag_end >= 2 && bytes[tag_end - 2] == b'/' {
            i = tag_end;
            continue;
        }
        let name = std::str::from_utf8(&bytes[start_name..end_name])
            .ok()?
            .to_string();
        return Some(OpenTag {
            start: i,
            tag_end,
            name,
        });
    }
    None
}

/// Find the byte offset (in `text`) at which the matching closing tag
/// ends — i.e. the offset just past the `>` of `</name ...>`. Mirrors
/// the laziness of the JS regex: we take the FIRST occurrence of
/// `</name` followed by optional whitespace and `>`.
fn find_matching_close(text: &str, close_prefix: &str) -> Option<usize> {
    let lower_text = text.to_lowercase();
    let lower_prefix = close_prefix.to_lowercase();
    let mut start = 0;
    while start < text.len() {
        let off = lower_text[start..].find(&lower_prefix)?;
        let abs = start + off;
        // After `</name`, allow optional whitespace, then `>`.
        let after = abs + close_prefix.len();
        let bytes = text.as_bytes();
        // The next char after the prefix must NOT be a name char (so
        // `</nameSibling>` doesn't match `</name`).
        if let Some(&c) = bytes.get(after) {
            if is_name_char(c) {
                start = after;
                continue;
            }
        } else {
            return None;
        }
        // Skip whitespace, then expect `>`.
        let mut j = after;
        while j < bytes.len() && bytes[j].is_ascii_whitespace() {
            j += 1;
        }
        if bytes.get(j).copied() == Some(b'>') {
            return Some(j + 1);
        }
        start = after;
    }
    None
}

fn is_name_start(b: Option<u8>) -> bool {
    matches!(b, Some(c) if c.is_ascii_alphabetic() || c == b'_')
}

fn is_name_char(c: u8) -> bool {
    c.is_ascii_alphanumeric() || c == b'_' || c == b'-'
}

/// Tiny `memchr` substitute to avoid the dep — we only ever look for `>`.
fn memchr_byte(needle: u8, haystack: &[u8]) -> Option<usize> {
    haystack.iter().position(|&b| b == needle)
}

// ---------------------------------------------------------------------------
// LLM call — generate the extraction regex
// ---------------------------------------------------------------------------

/// System prompt for the regex-generator lite-LLM call.
///
/// Byte-for-byte the same as the frontend's `SYSTEM_PROMPT` in
/// `frontend/lib/actions/sessions/prompts.ts` so cached regexes are
/// interchangeable across the frontend HTTP route and the Rust
/// ingestion path. If you edit this, edit the frontend constant too — diverging
/// will silently fork the cache (different prompts → different regexes
/// for the same input shape, both keyed under the same Redis key).
const REGEX_GENERATION_SYSTEM_PROMPT: &str = r#"<role>
You write re2 regexes that strip scaffolding wrappers from AI agent conversation messages, leaving the instruction the agent was asked to act on. Agent harnesses wrap each turn's real instruction in XML-like tags (e.g. <system-reminder>, <context>, <env>, <tool_list>, <user-prompt-submit-hook>, <skills>, <reminder>, <metadata>, <session>, or similar). Remove the wrapper; keep everything else. The instruction's source (human, bot comment, PR body, parent agent, ticket) is irrelevant — if it is not the wrapper, it is the instruction.
</role>

<core_principle>
DEFAULT IS PASSTHROUGH. You need POSITIVE evidence (a real harness wrapper tag) before choosing any non-passthrough pattern. When in any doubt, output (?s)(.*). Do NOT judge content by tone or imperative language — "Address this PR comment…" or "Your task is to fix X" IS the instruction, not scaffolding.
</core_principle>

<decision_procedure>
Follow these steps IN ORDER. Reveal only the final regex.

Step 1 — List every XML/HTML-like tag in the input.

Step 2 — Classify each as HARNESS WRAPPER or CONTENT.
  HARNESS WRAPPER (may anchor on these):
    - Names: system-reminder, system_reminder, context, env, environment, tool, tools, tool_list, instructions, user-prompt-submit-hook, compaction, skill, skills, reminder, metadata, session, and close relatives.
    - Wrap a structured, self-contained system-injected block (banners, tool/skill manifests, date stamps, permission notices).
    - Sit at the top or bottom of the message, not mid-paragraph.
  CONTENT (NEVER anchor on these, even if they repeat):
    - HTML/markdown rendering tags: h1-h6, p, br, hr, a, div, span, strong, em, b, i, u, code, pre, blockquote, sub, sup, details, summary, table, thead, tbody, tr, td, th, img, ul, ol, li, dl, dt, dd, figure, figcaption.
    - HTML/XML comments ("<!-- ... -->", "<!-- DESCRIPTION START -->", "<!-- LOCATIONS END -->", etc.). They are not tags at all — treat them as prose. NEVER anchor on a comment marker.
    - Any tag inside a bot comment / PR review / issue body / markdown body.
  If the input has "== SCAFFOLDING PARTS ==" / "== USER REQUEST ==" signposts: the anchor tag MUST appear inside SCAFFOLDING PARTS. A tag that only appears in USER REQUEST is payload — discard it. The "== ... ==" headers are stripped before the regex runs, so never reference them.

Step 3 — If zero HARNESS WRAPPER tags survive → (?s)(.*). Stop. Do NOT fall back to an <h3> or similar content tag.

Step 4 — Determine WHERE the scaffolding sits. Pick anchor tag T (a wrapper common to every sample). Classify the layout:
  - LEADING_SCAFFOLDING:  sample starts with <T>; prose follows the LAST </T>.        → Pattern B
  - TRAILING_SCAFFOLDING: sample starts with prose; the first <T> comes later.         → Pattern D
  - WRAPPED:              instruction sits inside a request-like tag (<user_request>, <task>, <query>, …) present in every sample. → Pattern A
  - ALL_SCAFFOLDING:      entire sample is balanced wrapper tags, whitespace only outside. → Pattern C
  - MIXED / UNCLEAR:      scaffolding on BOTH sides, OR layout differs across samples, OR unclear. → PASSTHROUGH

  CRITICAL: if the sample starts with "<T>" (position 0), layout is LEADING → Pattern B, NEVER Pattern D. Pattern D on starts-with-tag returns an empty capture.

Step 5 — Sanity-check: mentally run your regex. The capture MUST contain the instruction prose.
  - Empty or missing prose → wrong pattern. Most common: picked D on leading scaffolding. Switch to B.
  - Capture drops meaningful content (e.g. everything after an <h3> inside a PR body) → your anchor is a content tag. Back to Step 2.
  - Regex contains "<!--" or "-->" → you anchored on a comment marker. Reset to (?s)(.*).
</decision_procedure>

<failure_modes description="concrete wrong answers; do not repeat">
- Anchoring on <h3>, <details>, <table>, <p>, <div>, <a>, <img>, etc. inside a PR-bot / issue / markdown body. Always content.
- Anchoring on an HTML comment marker like "<!-- DESCRIPTION END -->" or "<!-- LOCATIONS START -->". These are metadata inside a bot-generated body, not scaffolding. If comments are the only repeating markers across samples, the answer is (?s)(.*).
- Picking Pattern D because a tag happens to appear. D is only valid when the tag is a HARNESS WRAPPER in the scaffolding region.
- Picking Pattern D on LEADING scaffolding. Example: "<system-reminder>…</system-reminder>\nGood first draft. Now a couple of notes…" — starts with the tag, so D captures empty. Correct: Pattern B "(?s).*</system-reminder>\s*(.*)". Rule: input begins with the opening anchor tag ⇒ never Pattern D.
</failure_modes>

<patterns>
  <pattern id="A" name="Inside a request-like tag">
    <template>(?s)<tag>\s*(.*?)\s*</tag></template>
  </pattern>

  <pattern id="B" name="After leading scaffolding">
    Scaffolding tags appear at the top; instruction is the plain text AFTER the LAST closing tag.
    <template>(?s).*</tag>\s*(.*)</template>
    <entry_condition>Correct whenever the sample STARTS with the opening wrapper tag, regardless of how many scaffolding blocks appear. Do NOT switch to D.</entry_condition>
    <critical>The leading ".*" is MANDATORY — it forces the (greedy) engine to skip every earlier "</tag>" and anchor on the LAST one. Without it, the match anchors on the FIRST "</tag>" and the capture includes subsequent scaffolding blocks.</critical>
    <correct>(?s).*</system-reminder>\s*(.*)</correct>
    <wrong reason="missing leading .* — anchors on FIRST </system-reminder>">(?s)</system-reminder>\s*(.*)</wrong>
  </pattern>

  <pattern id="D" name="Before trailing scaffolding">
    Instruction comes BEFORE the scaffolding (trailing wrapper blocks). Never use with a CONTENT tag.
    <template>(?s)^(.*?)<tag></template>
    <entry_condition>Valid ONLY if, in every sample, there is non-trivial prose BEFORE the first occurrence of &lt;tag&gt;. If the sample starts with &lt;tag&gt; → scaffolding is LEADING → use Pattern B.</entry_condition>
    <critical>"^" and LAZY "(.*?)" are both MANDATORY. "^" pins to start; "(.*?)" stops at the FIRST "<tag>". A greedy "(.*)" would swallow through the final "<tag>".</critical>
    <correct>(?s)^(.*?)<some-wrapper></correct>
    <wrong reason="greedy (.*) captures through the last opening tag">(?s)^(.*)<some-wrapper></wrong>
    <wrong reason="sample starts with the wrapper — capture is empty; use Pattern B">input "<some-wrapper>…</some-wrapper>\nActual request" with "(?s)^(.*?)<some-wrapper>"</wrong>
  </pattern>

  <pattern id="C" name="Pure wrapper (rare)">
    Every sample is balanced wrapper tags with whitespace only outside AND no request-like tag inside.
    <output>(?s)()</output>
    <note>If there is ANY non-trivial text outside the tags, use B or D. If unsure between C and anything else, never pick C.</note>
  </pattern>

  <pattern id="PASSTHROUGH" name="No reliable anchor">
    <output>(?s)(.*)</output>
    <note>Correct default when in doubt.</note>
  </pattern>

  <shape_examples description="copy the shape, not the tag name">
    - Starts with &lt;W&gt;…&lt;/W&gt;, then prose → Pattern B: (?s).*&lt;/W&gt;\s*(.*)  (never Pattern D)
    - Starts with prose, then trailing &lt;W&gt;…&lt;/W&gt; → Pattern D: (?s)^(.*?)&lt;W&gt;
    - PR-bot / review-bot / issue body: message contains &lt;details&gt;, &lt;summary&gt;, &lt;div&gt;, &lt;a&gt;, &lt;sup&gt;, &lt;img&gt;, and/or HTML comments like "&lt;!-- DESCRIPTION END --&gt;", but NO harness wrapper tag. → PASSTHROUGH (?s)(.*). The bot's body IS the instruction. Do NOT anchor on &lt;details&gt;, &lt;div&gt;, &lt;sup&gt;, or any "&lt;!-- ... --&gt;" marker.
  </shape_examples>
</patterns>

<tag_rules>
- The tag in your regex MUST appear VERBATIM in the input samples.
- The tag MUST be a HARNESS WRAPPER. Never anchor on CONTENT tags.
- NEVER use "<!-- ... -->" or "-->" / "<!--" fragments in the regex. The regex must anchor on a real tag ("<name>" or "</name>"), not a comment.
- Do NOT invent tag names. Do NOT copy tag names from this prompt (<user_request>, <query>, <system-reminder>, <context>, <tag>, <env>, <task>, <wrapper>, <W>) unless they literally exist in the input.
</tag_rules>

<general_rules>
- Exactly one capture group.
- re2 only: no lookaheads, lookbehinds, backreferences.
- Always prefix with (?s).
- The regex MUST match every sample. If samples disagree on scaffolding tags, prefer a tag common to all samples, else PASSTHROUGH.
</general_rules>

<greediness_rules>
When the anchor tag appears MULTIPLE TIMES (common — scaffolding blocks repeat), anchor on the right occurrence:
- LAST occurrence of a closing tag (Pattern B) → GREEDY ".*" prefix: "(?s).*</tag>\s*(.*)".
- FIRST occurrence of an opening tag (Pattern D) → "^" plus LAZY "(.*?)": "(?s)^(.*?)<tag>".
Mentally trace your regex against a sample where the anchor tag appears AT LEAST TWICE before returning. This is the #1 source of bad regexes for this task.
</greediness_rules>

<output_format>
Call the `submit_extraction_regex` tool with the regex pattern itself (starts with "(?s)", no surrounding quotes, no fences). Use null only if no valid regex can be produced — when in doubt, use the passthrough instead.
</output_format>"#;

/// Lite-LLM call to generate one extraction regex from one (or more)
/// sample inputs. Returns the trimmed regex (`None` on timeout / API
/// error / null result) and a [`PreviewLlmCall`] describing the call
/// itself so the caller can emit an observability span.
///
/// We force structured output via a one-tool function call rather than
/// asking for a JSON-shaped string — this avoids per-provider quirks
/// around code fences / explanation prefixes / trailing commas that
/// the frontend's `generateObject` handles for us in JS.
pub async fn generate_extraction_regex(
    llm_client: &Arc<LlmClient>,
    sample_input: &str,
) -> (Option<String>, PreviewLlmCall) {
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
                description: "Submit the chosen RE2 regex pattern, or null when no valid pattern can be produced.".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "regex": {
                            "type": "string",
                            "description": "An RE2 regex pattern starting with (?s) with exactly one capture group. Empty string for null."
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

    let (model, provider) = llm_client.resolve_model_provider(&request);
    let span_tools = request_to_tools_attr(&request);

    let call = llm_client.generate_content(&request);
    let timeout =
        tokio::time::timeout(std::time::Duration::from_secs(REGEX_LLM_TIMEOUT_SECS), call);
    let (response, error) = match timeout.await {
        Ok(Ok(r)) => (Some(r), None),
        Ok(Err(e)) => {
            log::warn!("extract_user_request LLM call failed: {}", e);
            (None, Some(format!("{}", e)))
        }
        Err(_) => {
            log::warn!("extract_user_request LLM call timed out");
            (
                None,
                Some(format!("timeout after {}s", REGEX_LLM_TIMEOUT_SECS)),
            )
        }
    };

    let usage = response.as_ref().and_then(|r| r.usage_metadata.as_ref());
    let regex = response
        .as_ref()
        .and_then(|r| extract_regex_from_response(r));

    let metadata = PreviewLlmCall {
        model,
        provider,
        output: regex
            .as_ref()
            .map(|r| serde_json::json!({ "regex": r }))
            .or_else(|| {
                response
                    .as_ref()
                    .map(|_| serde_json::json!({ "regex": null }))
            }),
        tools: span_tools,
        input_tokens: usage.and_then(|u| u.prompt_token_count),
        input_cached_tokens: usage.and_then(|u| u.cache_read_input_tokens),
        output_tokens: usage.and_then(|u| u.candidates_token_count),
        error,
    };

    (regex, metadata)
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
