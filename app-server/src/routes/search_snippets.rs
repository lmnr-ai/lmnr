const SNIPPET_CONTEXT_CHARS: usize = 50;

/// Escape a string for use inside a ClickHouse single-quoted string literal.
pub fn escape_clickhouse_string(s: &str) -> String {
    s.replace('\\', "\\\\").replace('\'', "\\'")
}

/// Post-process a raw snippet substring from ClickHouse into a final snippet
/// with `...` prefix/suffix and character-level highlight offsets.
///
/// - `raw_snippet`: the substring extracted by ClickHouse via `substringUTF8`
/// - `char_pos`: 1-indexed character position of the match in the original text (0 = no match)
/// - `snippet_max_chars`: max characters requested from ClickHouse (to infer suffix)
/// - `needle_char_len`: character length of the search phrase (for highlight range)
///
/// Returns `(text_with_ellipsis, [highlight_start, highlight_end])` in character offsets.
pub fn post_process_snippet(
    raw_snippet: &str,
    char_pos: u64,
    snippet_max_chars: u64,
    needle_char_len: usize,
) -> Option<(String, [usize; 2])> {
    if char_pos == 0 || raw_snippet.is_empty() {
        return None;
    }

    let snippet_char_start = (char_pos as i64 - SNIPPET_CONTEXT_CHARS as i64).max(1) as u64;
    let snippet_char_count = raw_snippet.chars().count() as u64;

    let has_prefix = snippet_char_start > 1;
    let has_suffix = snippet_char_count >= snippet_max_chars;

    let prefix_len: usize = if has_prefix { 3 } else { 0 };
    let highlight_start = prefix_len + (char_pos - snippet_char_start) as usize;
    let highlight = [highlight_start, highlight_start + needle_char_len];

    let mut text = String::new();
    if has_prefix {
        text.push_str("...");
    }
    text.push_str(raw_snippet);
    if has_suffix {
        text.push_str("...");
    }

    Some((text, highlight))
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

    #[test]
    fn test_post_process_snippet_no_match() {
        assert!(post_process_snippet("", 0, 100, 4).is_none());
        assert!(post_process_snippet("hello", 0, 100, 4).is_none());
    }

    #[test]
    fn test_post_process_snippet_at_start_no_suffix() {
        // snippet_max_chars=105 but snippet is only 20 chars → no suffix
        let result = post_process_snippet("Hello World test end", 1, 105, 5);
        let (text, highlight) = result.unwrap();
        assert!(!text.starts_with("..."));
        assert!(!text.ends_with("..."));
        assert_eq!(&text[..5], "Hello");
        assert_eq!(highlight, [0, 5]);
    }

    #[test]
    fn test_post_process_snippet_with_ellipsis() {
        // snippet is exactly 106 chars (== snippet_max_chars) → has suffix
        let snippet = "x".repeat(50) + "TARGET" + &"y".repeat(50);
        let snippet_max_chars = snippet.chars().count() as u64;
        let result = post_process_snippet(&snippet, 100, snippet_max_chars, 6);
        let (text, highlight) = result.unwrap();
        assert!(text.starts_with("..."));
        assert!(text.ends_with("..."));
        let chars: Vec<char> = text.chars().collect();
        let highlighted: String = chars[highlight[0]..highlight[1]].iter().collect();
        assert_eq!(highlighted, "TARGET");
    }

    #[test]
    fn test_post_process_snippet_case_insensitive_highlight() {
        // needle is "world" (5 chars), match is at char_pos=7 in "Hello WORLD test"
        let result = post_process_snippet("Hello WORLD test", 7, 105, 5);
        let (text, highlight) = result.unwrap();
        let chars: Vec<char> = text.chars().collect();
        let highlighted: String = chars[highlight[0]..highlight[1]].iter().collect();
        assert_eq!(highlighted, "WORLD");
    }
}
