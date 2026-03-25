pub const SNIPPET_CONTEXT_CHARS: usize = 50;

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
/// non-alphanumeric boundaries) and build two ClickHouse-compatible (re2) regexes:
///
/// 1. **Match regex** – matches just the phrase with flexible non-alnum gaps.
/// 2. **Context regex** – same core pattern wrapped with `[\s\S]{0,N}` on each
///    side to pull surrounding context in a single `extract()` call.
///
/// Returns `None` when the query yields no alphanumeric tokens.
/// The returned strings are raw regex; call `escape_clickhouse_string` before
/// embedding them in a SQL string literal.
///
/// The regex avoids `(?i)` / `(?s)` flags entirely (uses inline `[aA]` classes
/// and `[\s\S]` wildcards) because the `clickhouse` crate treats `?` as a bind
/// parameter placeholder.
pub fn build_search_regexes(query: &str) -> Option<(String, String)> {
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

    let match_regex = core.clone();
    let context_regex = format!(
        "[\\s\\S]{{0,{ctx}}}{core}[\\s\\S]{{0,{ctx}}}",
        ctx = SNIPPET_CONTEXT_CHARS,
    );

    Some((match_regex, context_regex))
}

/// Post-process an `extract()`-produced snippet and matched text into a final
/// snippet with `...` prefix/suffix and character-level highlight offsets.
///
/// Returns `(text_with_ellipsis, [highlight_start, highlight_end])` in character
/// offsets, or `None` when either string is empty / no match found.
pub fn post_process_snippet(
    snippet: &str,
    matched_text: &str,
    context_char_size: usize,
) -> Option<(String, [usize; 2])> {
    if snippet.is_empty() || matched_text.is_empty() {
        return None;
    }

    let byte_pos = snippet.to_lowercase().find(&matched_text.to_lowercase())?;

    let char_pos = snippet[..byte_pos].chars().count();
    let matched_char_len = matched_text.chars().count();
    let snippet_char_len = snippet.chars().count();

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

    let prefix_offset = if has_prefix { 3 } else { 0 };
    let highlight_start = prefix_offset + char_pos;
    let highlight_end = highlight_start + matched_char_len;

    Some((text, [highlight_start, highlight_end]))
}

#[cfg(test)]
mod tests {
    use super::*;

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
        assert_eq!(m, "[hH][eE][lL][lL][oO]");
        assert!(c.contains("[hH][eE][lL][lL][oO]"));
        assert!(
            !m.contains('?'),
            "regex must not contain ? (clickhouse crate bind placeholder)"
        );
    }

    #[test]
    fn test_regex_multi_token() {
        let (m, _) = build_search_regexes("git commit -m").unwrap();
        assert_eq!(
            m,
            "[gG][iI][tT][^a-zA-Z0-9]+[cC][oO][mM][mM][iI][tT][^a-zA-Z0-9]+[mM]"
        );
    }

    #[test]
    fn test_regex_non_alnum_separators() {
        let (m, _) = build_search_regexes("submit=true").unwrap();
        assert_eq!(m, "[sS][uU][bB][mM][iI][tT][^a-zA-Z0-9]+[tT][rR][uU][eE]");
    }

    #[test]
    fn test_regex_punctuation_only_returns_none() {
        assert!(build_search_regexes("===").is_none());
        assert!(build_search_regexes("...").is_none());
    }

    #[test]
    fn test_regex_escapes_re2_metachar_in_token() {
        let (m, _) = build_search_regexes("a]b").unwrap();
        assert_eq!(m, "[aA][^a-zA-Z0-9]+[bB]");
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
        assert_eq!(m, "404");
    }

    // ── post_process_snippet ────────────────────────────────────────────

    #[test]
    fn test_post_process_snippet_no_match() {
        assert!(post_process_snippet("", "", 50).is_none());
        assert!(post_process_snippet("hello world", "", 50).is_none());
        assert!(post_process_snippet("", "hello", 50).is_none());
    }

    #[test]
    fn test_post_process_snippet_simple_match() {
        let result = post_process_snippet("Hello World test end", "Hello", 50);
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
        let result = post_process_snippet(&snippet, "TARGET", SNIPPET_CONTEXT_CHARS);
        let (text, highlight) = result.unwrap();
        assert!(text.starts_with("..."));
        assert!(text.ends_with("..."));
        let chars: Vec<char> = text.chars().collect();
        let highlighted: String = chars[highlight[0]..highlight[1]].iter().collect();
        assert_eq!(highlighted, "TARGET");
    }

    #[test]
    fn test_post_process_snippet_case_insensitive_find() {
        let result = post_process_snippet("Hello WORLD test", "world", 50);
        let (text, highlight) = result.unwrap();
        let chars: Vec<char> = text.chars().collect();
        let highlighted: String = chars[highlight[0]..highlight[1]].iter().collect();
        assert_eq!(highlighted, "WORLD");
    }

    #[test]
    fn test_post_process_snippet_flexible_match() {
        let result = post_process_snippet("submit: true is set", "submit: true", 50);
        let (text, highlight) = result.unwrap();
        let chars: Vec<char> = text.chars().collect();
        let highlighted: String = chars[highlight[0]..highlight[1]].iter().collect();
        assert_eq!(highlighted, "submit: true");
    }
}
