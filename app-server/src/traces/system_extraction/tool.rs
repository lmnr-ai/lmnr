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
use serde_json::{Map, Value, json};
use similar::{ChangeTag, TextDiff};

use crate::llm::models::{ProviderFunctionDeclaration, ProviderTool};

pub const REGEX_TOOL_NAME: &str = "regex";

const RESIDUAL_CAP: usize = 1200;
const REMOVED_CAP: usize = 700;
/// Shared-removed substrings are found via 48-gram intersection.
const SHARED_GRAM_LEN: usize = 48;
const GAP_SEPARATOR: &str = "\n⟦── gap ──⟧\n";
/// Context window around the first divergent byte: `[k-80, k+140)`.
const DIVERGENCE_BEFORE: usize = 80;
const DIVERGENCE_AFTER: usize = 140;

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
            description: "Run an ordered list of removal regex patterns against every shown \
                example system prompt. Patterns are applied sequentially with flags gm \
                (ECMAScript-style, lookbehind supported): every match is deleted and the result \
                feeds the next pattern. Returns the residual static skeletons, whether they all \
                collapsed to identical output, first-divergence context, the removed text, and \
                shared-removed (over-sweep) diagnostics."
                .to_string(),
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
        for (i, residual) in residuals.iter().enumerate().skip(1) {
            if residual == &residuals[0] {
                continue;
            }
            let k = first_divergent_byte(&residuals[0], residual);
            let mut entry = Map::new();
            entry.insert("vsExample".to_string(), json!(i + 1));
            entry.insert("offset".to_string(), json!(k));
            entry.insert(
                "example1Residual".to_string(),
                json!(divergence_window(&residuals[0], k)),
            );
            entry.insert(
                format!("example{}Residual", i + 1),
                json!(divergence_window(residual, k)),
            );
            divergences.push(Value::Object(entry));
        }
    }

    let removed_blocks: Vec<Vec<String>> = examples
        .iter()
        .zip(&residuals)
        .map(|(original, residual)| removed_blocks(original, residual))
        .collect();
    let removed: Vec<String> = removed_blocks
        .iter()
        .map(|blocks| cap(&blocks.join(GAP_SEPARATOR), REMOVED_CAP))
        .collect();
    let shared_removed = shared_removed(&removed_blocks);

    json!({
        "isValid": failing_regex.is_none(),
        "failingRegex": failing_regex,
        "isResultInAllIdenticalOutput": identical,
        "residuals": residuals.iter().map(|r| cap(r, RESIDUAL_CAP)).collect::<Vec<_>>(),
        "residualLengths": residuals.iter().map(|r| r.chars().count()).collect::<Vec<_>>(),
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

/// Cap `s` to `cap` chars: head of `cap - 120` chars + omission marker + last
/// 80 chars.
fn cap(s: &str, cap: usize) -> String {
    let chars: Vec<char> = s.chars().collect();
    if chars.len() <= cap {
        return s.to_string();
    }
    let head_len = cap.saturating_sub(120);
    let head: String = chars[..head_len].iter().collect();
    let tail: String = chars[chars.len() - 80..].iter().collect();
    let overflow = chars.len() - head_len - 80;
    format!("{head}\n…[{overflow} chars omitted]…\n{tail}")
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
/// surviving (equal) lines.
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

/// Substrings of length >= [`SHARED_GRAM_LEN`] chars present in EVERY
/// example's removed text: 48-gram intersection over example 0's blocks,
/// merged into maximal runs. Empty when fewer than 2 examples.
fn shared_removed(removed_blocks: &[Vec<String>]) -> Vec<String> {
    if removed_blocks.len() < 2 {
        return Vec::new();
    }
    let other_gram_sets: Vec<HashSet<&str>> = removed_blocks[1..]
        .iter()
        .map(|blocks| {
            blocks
                .iter()
                .flat_map(|b| {
                    char_gram_ranges(b, SHARED_GRAM_LEN)
                        .into_iter()
                        .map(move |(s, e)| &b[s..e])
                })
                .collect()
        })
        .collect();

    let mut seen: HashSet<String> = HashSet::new();
    let mut result: Vec<String> = Vec::new();
    for block in &removed_blocks[0] {
        let grams = char_gram_ranges(block, SHARED_GRAM_LEN);
        let mut run_start: Option<usize> = None;
        for i in 0..=grams.len() {
            let is_shared = i < grams.len() && {
                let g = &block[grams[i].0..grams[i].1];
                other_gram_sets.iter().all(|set| set.contains(g))
            };
            if is_shared {
                run_start.get_or_insert(i);
            } else if let Some(rs) = run_start.take() {
                let merged = block[grams[rs].0..grams[i - 1].1].to_string();
                if seen.insert(merged.clone()) {
                    result.push(merged);
                }
            }
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn residuals(v: &Value) -> Vec<String> {
        v["residuals"]
            .as_array()
            .unwrap()
            .iter()
            .map(|r| r.as_str().unwrap().to_string())
            .collect()
    }

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
        assert_eq!(residuals(&out), vec!["Rules stay.\nBe nice."; 2]);
        assert_eq!(out["residualDivergences"], json!([]));
        let removed = out["removed"].as_array().unwrap();
        assert_eq!(removed[0], "Current date: 2026-07-01");
        assert_eq!(removed[1], "Current date: 2026-07-02");
    }

    #[test]
    fn patterns_apply_sequentially() {
        let examples = vec!["abc".to_string()];
        // "ac" doesn't match the original; it only matches after "b" is removed.
        let out = run_regex_tool(&["b".to_string(), "ac".to_string()], &examples);
        assert_eq!(residuals(&out), vec![""]);
    }

    #[test]
    fn supports_lookbehind() {
        let examples = vec!["User id: 42 end".to_string(), "User id: 7 end".to_string()];
        let out = run_regex_tool(&["(?<=User id: )\\d+".to_string()], &examples);
        assert_eq!(out["isValid"], json!(true));
        assert_eq!(residuals(&out), vec!["User id:  end"; 2]);
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
        // First pattern applied, third was not.
        assert_eq!(residuals(&out), vec!["world"]);
    }

    #[test]
    fn reports_divergences_with_dynamic_key() {
        let examples = vec![
            "same prefix ALPHA tail".to_string(),
            "same prefix BETA tail".to_string(),
        ];
        let out = run_regex_tool(&[], &examples);
        assert_eq!(out["isResultInAllIdenticalOutput"], json!(false));
        let div = &out["residualDivergences"][0];
        assert_eq!(div["vsExample"], json!(2));
        assert_eq!(div["offset"], json!(12));
        assert!(div["example1Residual"].as_str().unwrap().contains("ALPHA"));
        assert!(div["example2Residual"].as_str().unwrap().contains("BETA"));
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
        assert!(
            shared[0]
                .as_str()
                .unwrap()
                .contains("Always answer politely")
        );
    }

    #[test]
    fn shared_removed_empty_for_single_example() {
        let examples = vec!["only one example here".to_string()];
        let out = run_regex_tool(&["only ".to_string()], &examples);
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
        let capped = cap(&long, RESIDUAL_CAP);
        assert!(capped.starts_with(&"x".repeat(RESIDUAL_CAP - 120)));
        assert!(capped.contains("…[840 chars omitted]…"));
        assert!(capped.ends_with(&"x".repeat(80)));
        // True length reported separately.
        let out = run_regex_tool(&[], &[long.clone()]);
        assert_eq!(out["residualLengths"][0], json!(2000));
    }

    #[test]
    fn empty_match_patterns_terminate() {
        let examples = vec!["abc".to_string()];
        let out = run_regex_tool(&["x*".to_string()], &examples);
        assert_eq!(out["isValid"], json!(true));
        assert_eq!(residuals(&out), vec!["abc"]);
    }
}
