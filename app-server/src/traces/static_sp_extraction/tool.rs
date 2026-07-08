//! The `regex` tool: applies an ordered list of removal regexes against every
//! example prompt and reports collapse diagnostics back to the model.
//!
//! Execution semantics (must stay stable — the agent's system prompt describes
//! them to the model): each pattern is compiled with flags `g` + `m`
//! (multiline `^`/`$`, no dotall, lookbehind supported — hence `fancy_regex`),
//! every match is replaced with `""`, and the result feeds the next pattern.

use std::collections::HashSet;

use fancy_regex::Regex;
use serde::Deserialize;
use serde_json::{Value, json};
use similar::{ChangeTag, TextDiff};

use crate::llm::models::{ProviderFunctionDeclaration, ProviderTool};

pub const REGEX_TOOL_NAME: &str = "regex";

const REMOVED_CAP: usize = 700;
/// Shared-removed substrings are found via 48-gram intersection.
const SHARED_GRAM_LEN: usize = 48;
/// At most this many shared-removed chunks are reported.
const MAX_SHARED_CHUNKS: usize = 20;
const GAP_SEPARATOR: &str = "\n⟦── gap ──⟧\n";
/// Context window around the first divergent byte: `[k-80, k+140)`.
const DIVERGENCE_BEFORE: usize = 80;
const DIVERGENCE_AFTER: usize = 140;

/// What the model sees. Deliberately omits `residuals` / `residualLengths` /
/// `offset` — ablated: the model already holds the raw examples, and echoing
/// residuals per call blows the input budget.
const REGEX_TOOL_DESCRIPTION: &str = r#"Test a list of candidate regexes against ALL of the shown example system prompts. The regexes are applied SEQUENTIALLY as REMOVALS (each match replaced with the empty string) using fixed `gm` flags to each example independently; the output of one regex is the input to the next. Returns:
- `isValid` / `failingRegex`: whether all regexes compiled+ran, and the first that failed.
- `isResultInAllIdenticalOutput`: true iff every residual is identical — the collapse goal.
- `residualDivergences`: when not collapsed, deduplicated {a, b} pairs — a = example 1's residual around the first differing byte, b = the differing example's. This pinpoints the dynamic text you have not handled yet; read it first.
- `removed`: the changed regions of example i (input − output), reported at LINE granularity — any line your regexes touched appears in full, even if only part of it (e.g. an inline date) was actually deleted. Non-adjacent changed blocks are separated by `⟦── gap ──⟧`. Use it to locate WHICH regions you are affecting, not the exact deleted substring; for the precise dynamic text read `residualDivergences`.
- `sharedRemoved`: static text (identical across every example) that appears in `removed`. A large multi-line span here means real over-removal — an over-broad sweep is eating a shared static block; tighten the offending regex (bound the sweep with a `(?=<landmark>)` instead of running to the end of the prompt). CAVEAT: because `removed` is line-granular, deleting an inline dynamic value also surfaces the static remainder of that same line, so a SHORT within-a-single-line entry here can be a false positive from a correct inline-removal regex — confirm against `residualDivergences` before tightening. `isResultInAllIdenticalOutput: true` with a large multi-line `sharedRemoved` is NOT success: the sweep collapsed every example to the same prefix while deleting shared static text."#;

#[derive(Debug, Deserialize)]
pub struct RegexToolInput {
    pub regexes: Vec<String>,
}

/// Tool declaration handed to the LLM. The raw examples are held harness-side;
/// the model only ever passes patterns.
pub fn regex_tool() -> ProviderTool {
    ProviderTool {
        function_declarations: vec![ProviderFunctionDeclaration {
            name: REGEX_TOOL_NAME.to_string(),
            description: REGEX_TOOL_DESCRIPTION.to_string(),
            parameters: json!({
                "type": "object",
                "required": ["regexes"],
                "properties": {
                    "regexes": {
                        "type": "array",
                        "items": { "type": "string" },
                        "description": "Ordered list of regex patterns to apply as removals against every shown example prompt."
                    }
                }
            }),
        }],
    }
}

/// Run the removal regexes against all examples and build the tool response.
pub fn run_regex_tool(regexes: &[String], examples: &[String]) -> Value {
    let mut residuals: Vec<String> = examples.to_vec();
    let mut failing_regex: Option<String> = None;

    'patterns: for pattern in regexes {
        let compiled = match Regex::new(&format!("(?m){pattern}")) {
            Ok(re) => re,
            Err(_) => {
                failing_regex = Some(pattern.clone());
                break;
            }
        };
        let mut next = Vec::with_capacity(residuals.len());
        for residual in &residuals {
            match remove_all(&compiled, residual) {
                Ok(out) => next.push(out),
                Err(_) => {
                    // Runtime failure (e.g. backtrack limit) counts as a failing
                    // pattern; processing stops at this pattern for all examples.
                    failing_regex = Some(pattern.clone());
                    break 'patterns;
                }
            }
        }
        residuals = next;
    }

    let identical = residuals.windows(2).all(|w| w[0] == w[1]);

    let mut divergences: Vec<Value> = Vec::new();
    if !identical {
        let mut seen: HashSet<String> = HashSet::new();
        for residual in residuals.iter().skip(1) {
            if residual == &residuals[0] {
                continue;
            }
            let k = first_divergent_byte(&residuals[0], residual);
            let a = divergence_window(&residuals[0], k);
            let b = divergence_window(residual, k);
            // Several examples usually diverge identically — dedup.
            if seen.insert(format!("{a} {b}")) {
                divergences.push(json!({ "a": a, "b": b }));
            }
        }
    }

    let removed_blocks: Vec<Vec<String>> = examples
        .iter()
        .zip(&residuals)
        .map(|(original, residual)| removed_blocks(original, residual))
        .collect();
    let removed: Vec<String> = removed_blocks
        .iter()
        .map(|blocks| cap_text(&blocks.join(GAP_SEPARATOR), REMOVED_CAP))
        .collect();
    let shared_removed = shared_removed(&removed_blocks);

    json!({
        "isValid": failing_regex.is_none(),
        "failingRegex": failing_regex,
        "isResultInAllIdenticalOutput": identical,
        "residualDivergences": divergences,
        "removed": removed,
        "sharedRemoved": shared_removed,
    })
}

/// Delete every match of `re` from `text`. Manual loop instead of
/// `Regex::replace_all` so runtime errors surface as `Err` instead of a panic.
fn remove_all(re: &Regex, text: &str) -> Result<String, fancy_regex::Error> {
    let mut out = String::with_capacity(text.len());
    let mut last = 0;
    for m in re.find_iter(text) {
        let m = m?;
        out.push_str(&text[last..m.start()]);
        last = m.end();
    }
    out.push_str(&text[last..]);
    Ok(out)
}

/// Cap `s` to roughly `cap` chars: head of `cap - 120` chars + omission
/// marker + last 80 chars.
fn cap_text(s: &str, cap: usize) -> String {
    let chars: Vec<char> = s.chars().collect();
    if chars.len() <= cap {
        return s.to_string();
    }
    let head: String = chars[..cap.saturating_sub(120)].iter().collect();
    let tail: String = chars[chars.len() - 80..].iter().collect();
    let omitted = chars.len() - cap;
    format!("{head}\n…[{omitted} chars omitted]…\n{tail}")
}

fn first_divergent_byte(a: &str, b: &str) -> usize {
    let (a, b) = (a.as_bytes(), b.as_bytes());
    let min = a.len().min(b.len());
    (0..min).find(|&i| a[i] != b[i]).unwrap_or(min)
}

fn floor_char_boundary(s: &str, mut i: usize) -> usize {
    i = i.min(s.len());
    while !s.is_char_boundary(i) {
        i -= 1;
    }
    i
}

fn divergence_window(s: &str, k: usize) -> &str {
    let start = floor_char_boundary(s, k.saturating_sub(DIVERGENCE_BEFORE));
    let end = floor_char_boundary(s, k.saturating_add(DIVERGENCE_AFTER));
    &s[start..end]
}

/// Line-granular diff of `original` vs `residual`, keeping only the removed
/// side. Contiguous deleted lines form one block; blocks are split on
/// surviving (equal) lines. NOTE: line-granular by design — a char/word diff
/// is O(N·D) Myers and hangs for minutes on the huge (100k+ char) system
/// prompts this tool runs against. The cost is that a regex deleting only part
/// of a line surfaces the WHOLE line here; the tool description tells the model
/// to rely on `residualDivergences` for the exact dynamic text.
fn removed_blocks(original: &str, residual: &str) -> Vec<String> {
    let diff = TextDiff::from_lines(original, residual);
    let mut blocks: Vec<String> = Vec::new();
    let mut current = String::new();
    for change in diff.iter_all_changes() {
        match change.tag() {
            ChangeTag::Delete => current.push_str(change.value()),
            ChangeTag::Equal => {
                if !current.is_empty() {
                    blocks.push(std::mem::take(&mut current));
                }
            }
            ChangeTag::Insert => {}
        }
    }
    if !current.is_empty() {
        blocks.push(current);
    }
    blocks
        .into_iter()
        .map(|b| b.strip_suffix('\n').map(str::to_string).unwrap_or(b))
        .collect()
}

/// Byte ranges of every `gram`-char window in `s`.
fn char_gram_ranges(s: &str, gram: usize) -> Vec<(usize, usize)> {
    let starts: Vec<usize> = s.char_indices().map(|(i, _)| i).collect();
    let n = starts.len();
    if n < gram {
        return Vec::new();
    }
    (0..=n - gram)
        .map(|p| {
            let end = if p + gram < n {
                starts[p + gram]
            } else {
                s.len()
            };
            (starts[p], end)
        })
        .collect()
}

/// Collapse every whitespace run to a single space and trim.
fn collapse_whitespace(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut pending_space = false;
    for c in s.chars() {
        if c.is_whitespace() {
            pending_space = true;
        } else {
            if pending_space && !out.is_empty() {
                out.push(' ');
            }
            pending_space = false;
            out.push(c);
        }
    }
    out
}

/// Substrings of length >= [`SHARED_GRAM_LEN`] chars present in the deleted
/// text of EVERY example (i.e. static content being wrongly swept): 48-gram
/// intersection over example 0's uncapped removed text, extended into maximal
/// runs. Substring- rather than line-based so it still fires when a static
/// footer is swept at different offsets or truncated differently per example.
/// Empty when fewer than 2 examples or any example's removed text is shorter
/// than one gram.
fn shared_removed(removed_blocks: &[Vec<String>]) -> Vec<String> {
    if removed_blocks.len() < 2 {
        return Vec::new();
    }
    let texts: Vec<String> = removed_blocks
        .iter()
        .map(|blocks| blocks.join("\n"))
        .collect();
    if texts.iter().any(|t| t.chars().count() < SHARED_GRAM_LEN) {
        return Vec::new();
    }

    let gram_sets: Vec<HashSet<&str>> = texts[1..]
        .iter()
        .map(|t| {
            char_gram_ranges(t, SHARED_GRAM_LEN)
                .into_iter()
                .map(|(s, e)| &t[s..e])
                .collect()
        })
        .collect();

    let base = &texts[0];
    let starts: Vec<usize> = base.char_indices().map(|(b, _)| b).collect();
    let n = starts.len();
    let byte_at = |p: usize| if p < n { starts[p] } else { base.len() };
    let in_all = |p: usize| {
        let gram = &base[byte_at(p)..byte_at(p + SHARED_GRAM_LEN)];
        gram_sets.iter().all(|set| set.contains(gram))
    };

    let mut chunks: Vec<String> = Vec::new();
    let mut i = 0;
    while i + SHARED_GRAM_LEN <= n && chunks.len() < MAX_SHARED_CHUNKS {
        if in_all(i) {
            // Greedily extend right while each new trailing gram is shared.
            let mut len = SHARED_GRAM_LEN;
            while i + len < n && in_all(i + len - SHARED_GRAM_LEN + 1) {
                len += 1;
            }
            chunks.push(collapse_whitespace(&base[byte_at(i)..byte_at(i + len)]));
            i += len;
        } else {
            i += 1;
        }
    }
    chunks
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn removes_metadata_lines_and_collapses() {
        let examples = vec![
            "Rules stay.\nCurrent date: 2026-07-01\nBe nice.".to_string(),
            "Rules stay.\nCurrent date: 2026-07-02\nBe nice.".to_string(),
        ];
        let out = run_regex_tool(&["^Current date: .*\\n?".to_string()], &examples);
        assert_eq!(out["isValid"], json!(true));
        assert_eq!(out["failingRegex"], Value::Null);
        assert_eq!(out["isResultInAllIdenticalOutput"], json!(true));
        assert_eq!(out["residualDivergences"], json!([]));
        let removed = out["removed"].as_array().unwrap();
        assert_eq!(removed[0], "Current date: 2026-07-01");
        assert_eq!(removed[1], "Current date: 2026-07-02");
    }

    #[test]
    fn omits_ablated_fields() {
        let out = run_regex_tool(&[], &["a".to_string()]);
        assert!(out.get("residuals").is_none());
        assert!(out.get("residualLengths").is_none());
    }

    #[test]
    fn patterns_apply_sequentially() {
        let examples = vec!["abc".to_string()];
        // "ac" doesn't match the original; it only matches after "b" is removed.
        let out = run_regex_tool(&["b".to_string(), "ac".to_string()], &examples);
        assert_eq!(out["removed"][0], json!("abc"));
    }

    #[test]
    fn supports_lookbehind() {
        let examples = vec!["User id: 42 end".to_string(), "User id: 7 end".to_string()];
        let out = run_regex_tool(&["(?<=User id: )\\d+".to_string()], &examples);
        assert_eq!(out["isValid"], json!(true));
        assert_eq!(out["isResultInAllIdenticalOutput"], json!(true));
    }

    #[test]
    fn invalid_pattern_stops_processing() {
        let examples = vec!["hello world".to_string()];
        let out = run_regex_tool(
            &[
                "hello ".to_string(),
                "(unclosed".to_string(),
                "world".to_string(),
            ],
            &examples,
        );
        assert_eq!(out["isValid"], json!(false));
        assert_eq!(out["failingRegex"], json!("(unclosed"));
        // First pattern applied ("hello " deleted), third was not.
        assert_eq!(out["removed"][0], json!("hello world"));
    }

    #[test]
    fn reports_deduplicated_divergence_pairs() {
        let examples = vec![
            "same prefix ALPHA tail".to_string(),
            "same prefix BETA tail".to_string(),
            "same prefix BETA tail".to_string(),
        ];
        let out = run_regex_tool(&[], &examples);
        assert_eq!(out["isResultInAllIdenticalOutput"], json!(false));
        let divergences = out["residualDivergences"].as_array().unwrap();
        // Examples 2 and 3 diverge identically — deduplicated to one pair.
        assert_eq!(divergences.len(), 1);
        assert!(divergences[0]["a"].as_str().unwrap().contains("ALPHA"));
        assert!(divergences[0]["b"].as_str().unwrap().contains("BETA"));
        assert!(divergences[0].get("offset").is_none());
    }

    #[test]
    fn shared_removed_flags_common_swept_text() {
        let footer = "## Rules\nAlways answer politely and cite every source you used in the end.";
        assert!(footer.chars().count() >= SHARED_GRAM_LEN);
        let examples = vec![
            format!("intro\nDATA: a1\n{footer}"),
            format!("intro\nDATA: b2\n{footer}"),
        ];
        // Over-sweep: from DATA to end of prompt, eating the static footer.
        let out = run_regex_tool(&["DATA: [\\s\\S]*".to_string()], &examples);
        assert_eq!(out["isResultInAllIdenticalOutput"], json!(true));
        let shared = out["sharedRemoved"].as_array().unwrap();
        assert_eq!(shared.len(), 1);
        // Whitespace-collapsed and trimmed.
        assert_eq!(
            shared[0],
            json!("## Rules Always answer politely and cite every source you used in the end.")
        );
    }

    #[test]
    fn shared_removed_empty_for_single_example() {
        let examples = vec!["only one example here".to_string()];
        let out = run_regex_tool(&["only ".to_string()], &examples);
        assert_eq!(out["sharedRemoved"], json!([]));
    }

    #[test]
    fn shared_removed_empty_when_removed_text_is_short() {
        let examples = vec!["shared bit A".to_string(), "shared bit B".to_string()];
        // Both remove the identical "shared bit " — but it's shorter than one gram.
        let out = run_regex_tool(&["shared bit ".to_string()], &examples);
        assert_eq!(out["isResultInAllIdenticalOutput"], json!(false));
        assert_eq!(out["sharedRemoved"], json!([]));
    }

    #[test]
    fn removed_joins_blocks_with_gap_marker() {
        let examples = vec!["a: 1\nkeep\nb: 2\nkeep2".to_string()];
        let out = run_regex_tool(&["^[ab]: \\d+\\n?".to_string()], &examples);
        assert_eq!(out["removed"][0], json!(format!("a: 1{GAP_SEPARATOR}b: 2")));
    }

    #[test]
    fn caps_long_strings_head_and_tail() {
        let long = "x".repeat(2000);
        let capped = cap_text(&long, REMOVED_CAP);
        assert!(capped.starts_with(&"x".repeat(REMOVED_CAP - 120)));
        assert!(capped.contains("…[1300 chars omitted]…"));
        assert!(capped.ends_with(&"x".repeat(80)));
    }

    #[test]
    fn empty_match_patterns_terminate() {
        let examples = vec!["abc".to_string()];
        let out = run_regex_tool(&["x*".to_string()], &examples);
        assert_eq!(out["isValid"], json!(true));
        assert_eq!(out["removed"][0], json!(""));
    }
}
