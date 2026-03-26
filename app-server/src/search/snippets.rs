use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub const SNIPPET_CONTEXT_CHARS: usize = 50;
const DEFAULT_SEARCH_MAX_TRACES: usize = 50;

#[derive(Serialize)]
pub struct SnippetInfo {
    pub text: String,
    pub highlight: [usize; 2],
}

#[derive(Serialize)]
pub struct SearchSpanHit {
    pub trace_id: String,
    pub span_id: String,
    pub input_snippet: Option<SnippetInfo>,
    pub output_snippet: Option<SnippetInfo>,
}

const RE2_META_CHARS: &[char] = &[
    '\\', '.', '+', '*', '?', '(', ')', '|', '[', ']', '{', '}', '^', '$',
];

/// Escape a string for use inside a ClickHouse single-quoted string literal.
pub fn escape_clickhouse_string(s: &str) -> String {
    s.replace('\\', "\\\\").replace('\'', "\\'")
}

/// Escape a single token for re2, making alphabetic characters case-insensitive
/// via inline char classes (`[aA]`) so we never need `(?i)` flags (which contain
/// `?` that the clickhouse crate misinterprets as bind placeholders).
fn escape_re2_token_ci(token: &str) -> String {
    token
        .chars()
        .map(|c| {
            if RE2_META_CHARS.contains(&c) {
                format!("\\{c}")
            } else if c.is_ascii_alphabetic() {
                format!("[{}{}]", c.to_ascii_lowercase(), c.to_ascii_uppercase())
            } else {
                c.to_string()
            }
        })
        .collect()
}

/// Tokenize `query` the same way Quickwit's default tokenizer does (split on
/// non-alphanumeric boundaries) and build two regexes:
///
/// 1. **Match regex** – matches just the phrase with flexible non-alnum gaps.
///    Used Rust-side (via the `regex` crate) to locate the match within a
///    snippet returned by ClickHouse.
/// 2. **Context regex** – same core pattern wrapped with `[\s\S]{0,N}` on each
///    side, used in a ClickHouse `extract()` call to pull surrounding context.
///    Call `escape_clickhouse_string` before embedding in a SQL string literal.
///
/// Returns `None` when the query yields no alphanumeric tokens.
///
/// Both regexes avoid `(?i)` / `(?s)` flags entirely (uses inline `[aA]`
/// classes and `[\s\S]` wildcards) because the `clickhouse` crate treats `?`
/// as a bind parameter placeholder.
pub fn build_search_regexes(query: &str) -> Option<(regex::Regex, String)> {
    let tokens: Vec<String> = query
        .split(|c: char| !c.is_alphanumeric())
        .filter(|t| !t.is_empty())
        .map(|t| escape_re2_token_ci(t))
        .collect();

    if tokens.is_empty() {
        return None;
    }

    let core = if tokens.len() == 1 {
        tokens[0].clone()
    } else {
        tokens.join("[^a-zA-Z0-9]+")
    };

    let match_re = regex::Regex::new(&core).ok()?;
    let context_regex = format!(
        "[\\s\\S]{{0,{ctx}}}{core}[\\s\\S]{{0,{ctx}}}",
        ctx = SNIPPET_CONTEXT_CHARS,
    );

    Some((match_re, context_regex))
}

/// Count UTF-16 code units for a slice of chars.
/// JS `String.prototype.slice()` operates on UTF-16 code units, so offsets
/// sent to the frontend must be in this unit, not Unicode codepoints.
fn utf16_len(chars: &[char]) -> usize {
    chars.iter().map(|c| c.len_utf16()).sum()
}

/// Post-process an `extract()`-produced context snippet by locating the match
/// via `match_re` and producing a final string with `...` prefix/suffix and
/// UTF-16 code-unit highlight offsets.
///
/// Returns `(text_with_ellipsis, [highlight_start, highlight_end])` in UTF-16
/// code-unit offsets (compatible with JS `String.prototype.slice()`), or `None`
/// when the snippet is empty or the regex doesn't match.
pub fn post_process_snippet(
    snippet: &str,
    match_re: &regex::Regex,
    context_char_size: usize,
) -> Option<(String, [usize; 2])> {
    if snippet.is_empty() {
        return None;
    }

    let m = match_re.find(snippet)?;
    let matched_text = m.as_str();
    let matched_char_len = matched_text.chars().count();
    let snippet_chars: Vec<char> = snippet.chars().collect();

    let byte_start = m.start();
    let char_pos = snippet[..byte_start].chars().count();
    let snippet_char_len = snippet_chars.len();

    let chars_before = char_pos;
    let chars_after = snippet_char_len.saturating_sub(char_pos + matched_char_len);

    let has_prefix = chars_before >= context_char_size;
    let has_suffix = chars_after >= context_char_size;

    let mut text = String::new();
    if has_prefix {
        text.push_str("...");
    }
    text.push_str(snippet);
    if has_suffix {
        text.push_str("...");
    }

    // "..." is 3 ASCII chars = 3 UTF-16 code units
    let prefix_offset: usize = if has_prefix { 3 } else { 0 };
    let highlight_start = prefix_offset + utf16_len(&snippet_chars[..char_pos]);
    let highlight_end =
        highlight_start + utf16_len(&snippet_chars[char_pos..char_pos + matched_char_len]);

    Some((text, [highlight_start, highlight_end]))
}

#[derive(clickhouse::Row, Deserialize)]
pub struct SpanSnippetRow {
    #[serde(with = "clickhouse::serde::uuid")]
    pub span_id: Uuid,
    pub input_snippet: String,
    pub output_snippet: String,
}

#[tracing::instrument(skip_all, fields(pairs_count = pairs.len()))]
pub async fn fetch_span_snippets(
    clickhouse: &clickhouse::Client,
    project_id: Uuid,
    pairs: &[(Uuid, Uuid)],
    context_regex: &str,
) -> Vec<SpanSnippetRow> {
    if pairs.is_empty() {
        return Vec::new();
    }

    let context_escaped = escape_clickhouse_string(context_regex);

    let tuples = build_key_tuples(pairs);
    let query = build_snippet_query(project_id, &context_escaped, &tuples);
    log::debug!("search_spans: snippet query: {:?}", query);

    let t_start = std::time::Instant::now();
    clickhouse
        .query(&query)
        .fetch_all::<SpanSnippetRow>()
        .await
        .inspect(|rows| {
            log::debug!(
                "[search_spans] clickhouse snippets: {}ms, {} rows",
                t_start.elapsed().as_millis(),
                rows.len()
            );
        })
        .unwrap_or_else(|e| {
            log::error!("Failed to fetch span snippets from ClickHouse: {:?}", e);
            Vec::new()
        })
}

fn build_key_tuples(pairs: &[(Uuid, Uuid)]) -> String {
    pairs
        .iter()
        .map(|(trace_id, span_id)| format!("('{trace_id}', '{span_id}')"))
        .collect::<Vec<_>>()
        .join(", ")
}

fn build_snippet_query(project_id: Uuid, context_regex: &str, key_tuples: &str) -> String {
    format!(
        "SELECT span_id,
                extract(input, '{context_regex}') AS input_snippet,
                extract(output, '{context_regex}') AS output_snippet
         FROM spans
         WHERE project_id = '{project_id}'
           AND (trace_id, span_id) IN ({key_tuples})
         ORDER BY start_time ASC"
    )
}

/// Given Quickwit hits as `(trace_id, span_id)` pairs, fetches context
/// snippets from ClickHouse and enriches each hit with highlighted matches.
///
/// When `is_single_trace` is false, only the first `DEFAULT_SEARCH_MAX_TRACES`
/// unique traces are kept.
#[tracing::instrument(skip_all, name = "enrich_hits_with_snippets")]
pub async fn enrich_hits_with_snippets(
    clickhouse: &clickhouse::Client,
    project_id: Uuid,
    hits: Vec<(String, String)>,
    is_single_trace: bool,
    search_query: &str,
) -> Vec<SearchSpanHit> {
    let mut unique_traces = HashSet::new();
    let snippet_pairs: Vec<(Uuid, Uuid)> = hits
        .iter()
        .filter_map(|(trace_id, span_id)| {
            if !is_single_trace {
                if unique_traces.contains(trace_id) {
                    return None;
                }
                if unique_traces.len() >= DEFAULT_SEARCH_MAX_TRACES {
                    return None;
                }
                unique_traces.insert(trace_id.clone());
            }
            let trace_id = Uuid::parse_str(trace_id).ok()?;
            let span_id = Uuid::parse_str(span_id).ok()?;
            Some((trace_id, span_id))
        })
        .collect();
    log::debug!("[search_spans] unique_traces: {}", unique_traces.len());

    let (match_re, context_regex) = match build_search_regexes(search_query) {
        Some(regexes) => regexes,
        None => {
            return hits
                .into_iter()
                .filter(|(tid, _)| is_single_trace || unique_traces.contains(tid))
                .map(|(trace_id, span_id)| SearchSpanHit {
                    trace_id,
                    span_id,
                    input_snippet: None,
                    output_snippet: None,
                })
                .collect();
        }
    };

    let snippet_rows =
        fetch_span_snippets(clickhouse, project_id, &snippet_pairs, &context_regex).await;

    let snippet_map: HashMap<String, SpanSnippetRow> = snippet_rows
        .into_iter()
        .map(|row| (row.span_id.to_string(), row))
        .collect();

    hits.into_iter()
        .filter(|(tid, _)| is_single_trace || unique_traces.contains(tid))
        .map(|(trace_id, span_id)| {
            if let Some(row) = snippet_map.get(&span_id) {
                let input_snippet =
                    post_process_snippet(&row.input_snippet, &match_re, SNIPPET_CONTEXT_CHARS)
                        .map(|(text, highlight)| SnippetInfo { text, highlight });

                let output_snippet =
                    post_process_snippet(&row.output_snippet, &match_re, SNIPPET_CONTEXT_CHARS)
                        .map(|(text, highlight)| SnippetInfo { text, highlight });

                SearchSpanHit {
                    trace_id,
                    span_id,
                    input_snippet,
                    output_snippet,
                }
            } else {
                SearchSpanHit {
                    trace_id,
                    span_id,
                    input_snippet: None,
                    output_snippet: None,
                }
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Extract a substring from `s` using UTF-16 code-unit offsets,
    /// mirroring JS `s.slice(start, end)`.
    fn js_slice(s: &str, start: usize, end: usize) -> String {
        let utf16: Vec<u16> = s.encode_utf16().collect();
        String::from_utf16(&utf16[start..end]).expect("invalid UTF-16 slice")
    }

    #[test]
    fn test_escape_clickhouse_string() {
        assert_eq!(escape_clickhouse_string("it's"), "it\\'s");
        assert_eq!(escape_clickhouse_string("a\\b"), "a\\\\b");
        assert_eq!(escape_clickhouse_string(r#"say "hello""#), r#"say "hello""#);
    }

    // ── build_search_regexes ────────────────────────────────────────────

    #[test]
    fn test_regex_single_token() {
        let (m, c) = build_search_regexes("hello").unwrap();
        assert_eq!(m.as_str(), "[hH][eE][lL][lL][oO]");
        assert!(c.contains("[hH][eE][lL][lL][oO]"));
    }

    #[test]
    fn test_regex_multi_token() {
        let (m, _) = build_search_regexes("git commit -m").unwrap();
        assert_eq!(
            m.as_str(),
            "[gG][iI][tT][^a-zA-Z0-9]+[cC][oO][mM][mM][iI][tT][^a-zA-Z0-9]+[mM]"
        );
    }

    #[test]
    fn test_regex_non_alnum_separators() {
        let (m, _) = build_search_regexes("submit=true").unwrap();
        assert_eq!(
            m.as_str(),
            "[sS][uU][bB][mM][iI][tT][^a-zA-Z0-9]+[tT][rR][uU][eE]"
        );
    }

    #[test]
    fn test_regex_punctuation_only_returns_none() {
        assert!(build_search_regexes("===").is_none());
        assert!(build_search_regexes("...").is_none());
    }

    #[test]
    fn test_regex_escapes_re2_metachar_in_token() {
        let (m, _) = build_search_regexes("a]b").unwrap();
        assert_eq!(m.as_str(), "[aA][^a-zA-Z0-9]+[bB]");
    }

    #[test]
    fn test_regex_context_uses_dotall_wildcard() {
        let (_, c) = build_search_regexes("test").unwrap();
        let expected_ctx = format!("[\\s\\S]{{0,{}}}", SNIPPET_CONTEXT_CHARS);
        assert!(c.starts_with(&expected_ctx));
        assert!(
            !c.contains('?'),
            "regex must not contain ? (clickhouse crate bind placeholder)"
        );
    }

    #[test]
    fn test_regex_numeric_tokens_pass_through() {
        let (m, _) = build_search_regexes("404").unwrap();
        assert_eq!(m.as_str(), "404");
    }

    // ── post_process_snippet ────────────────────────────────────────────

    fn re(pattern: &str) -> regex::Regex {
        regex::Regex::new(pattern).unwrap()
    }

    #[test]
    fn test_post_process_snippet_no_match() {
        let r = re("[hH][eE][lL][lL][oO]");
        assert!(post_process_snippet("", &r, 50).is_none());
        assert!(post_process_snippet("no match here", &r, 50).is_none());
    }

    #[test]
    fn test_post_process_snippet_simple_match() {
        let r = re("[hH][eE][lL][lL][oO]");
        let result = post_process_snippet("Hello World test end", &r, 50);
        let (text, highlight) = result.unwrap();
        assert!(!text.starts_with("..."));
        assert!(!text.ends_with("..."));
        assert_eq!(&text[..5], "Hello");
        assert_eq!(highlight, [0, 5]);
    }

    #[test]
    fn test_post_process_snippet_with_both_ellipses() {
        let before = "x".repeat(SNIPPET_CONTEXT_CHARS);
        let after = "y".repeat(SNIPPET_CONTEXT_CHARS);
        let snippet = format!("{before}TARGET{after}");
        let r = re("TARGET");
        let result = post_process_snippet(&snippet, &r, SNIPPET_CONTEXT_CHARS);
        let (text, highlight) = result.unwrap();
        assert!(text.starts_with("..."));
        assert!(text.ends_with("..."));
        assert_eq!(js_slice(&text, highlight[0], highlight[1]), "TARGET");
    }

    #[test]
    fn test_post_process_snippet_case_insensitive_find() {
        let r = re("[wW][oO][rR][lL][dD]");
        let result = post_process_snippet("Hello WORLD test", &r, 50);
        let (text, highlight) = result.unwrap();
        assert_eq!(js_slice(&text, highlight[0], highlight[1]), "WORLD");
    }

    #[test]
    fn test_post_process_snippet_flexible_match() {
        let r = re("[sS][uU][bB][mM][iI][tT][^a-zA-Z0-9]+[tT][rR][uU][eE]");
        let result = post_process_snippet("submit: true is set", &r, 50);
        let (text, highlight) = result.unwrap();
        assert_eq!(js_slice(&text, highlight[0], highlight[1]), "submit: true");
    }

    // ── UTF-16 encoding tests ────────────────────────────────────────────

    #[test]
    fn test_post_process_snippet_emoji_before_match() {
        let r = re("[hH][eE][lL][lL][oO]");
        let result = post_process_snippet("🎉 Hello world", &r, 50);
        let (text, highlight) = result.unwrap();
        assert_eq!(highlight[0], 3);
        assert_eq!(highlight[1], 8);
        assert_eq!(js_slice(&text, highlight[0], highlight[1]), "Hello");
    }

    #[test]
    fn test_post_process_snippet_multiple_emoji_before_match() {
        let r = re("[tT][eE][sS][tT]");
        let result = post_process_snippet("🎉🎊🎈 test word", &r, 50);
        let (text, highlight) = result.unwrap();
        assert_eq!(highlight[0], 7);
        assert_eq!(highlight[1], 11);
        assert_eq!(js_slice(&text, highlight[0], highlight[1]), "test");
    }

    #[test]
    fn test_post_process_snippet_emoji_with_ellipses() {
        let before = "🎉".repeat(SNIPPET_CONTEXT_CHARS);
        let after = "🎊".repeat(SNIPPET_CONTEXT_CHARS);
        let snippet = format!("{before}TARGET{after}");
        let r = re("TARGET");
        let result = post_process_snippet(&snippet, &r, SNIPPET_CONTEXT_CHARS);
        let (text, highlight) = result.unwrap();
        assert!(text.starts_with("..."));
        assert!(text.ends_with("..."));
        assert_eq!(js_slice(&text, highlight[0], highlight[1]), "TARGET");
        assert_eq!(highlight[0], 103);
        assert_eq!(highlight[1], 109);
    }

    #[test]
    fn test_post_process_snippet_bmp_chars_same_as_codepoints() {
        let r = re("[hH][eE][lL][lL][oO]");
        let result = post_process_snippet("日本語テスト hello", &r, 50);
        let (text, highlight) = result.unwrap();
        assert_eq!(highlight[0], 7);
        assert_eq!(highlight[1], 12);
        assert_eq!(js_slice(&text, highlight[0], highlight[1]), "hello");
    }
}
