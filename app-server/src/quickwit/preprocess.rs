use regex::Regex;
use std::sync::LazyLock;
use unicode_normalization::UnicodeNormalization;

use crate::utils::text_cleaning::{clean_whitespace, strip_noise};

static ANSI_ESCAPE_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\x1b\[[0-9;]*[a-zA-Z]").unwrap());

static WHITESPACE_CLASS_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"[\s\u00a0\u200b\ufeff]+").unwrap());

// Strip top-level `"role": "..."` and escaped `\"role\":\"...\"` plus their
// surrounding comma so the resulting JSON-ish text stays parseable visually.
static ROLE_FIELD_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"(?:"role"\s*:\s*"[^"]*"\s*,?\s*)"#).unwrap());

static ROLE_FIELD_ESCAPED_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"(?:\\"role\\"\s*:\s*\\"[^"\\]*\\"\s*,?\s*)"#).unwrap());

/// Preprocess a string for Quickwit indexing.
///
/// Normalization steps (in order):
/// 1. Unescape literal escape sequences (`\n`, `\t`, `\r`)
/// 2. Strip ANSI escape codes
/// 3. Replace all whitespace-class characters with a single space
/// 4. NFC Unicode normalization
pub fn preprocess_text(input: &str) -> String {
    let s = unescape_literal_sequences(input);
    let s = ANSI_ESCAPE_RE.replace_all(&s, "");
    let s = WHITESPACE_CLASS_RE.replace_all(&s, " ");
    let s: String = s.nfc().collect();
    s
}

/// Strip `"role": "..."` JSON object entries (and the escaped variant) so the
/// indexed text doesn't return hits for `user`/`system` role metadata.
pub fn strip_role_keys(s: &str) -> String {
    let s = ROLE_FIELD_RE.replace_all(s, "");
    ROLE_FIELD_ESCAPED_RE.replace_all(&s, "").into_owned()
}

/// Full cleaning pipeline for indexed span text:
/// strip ANSI → strip noise → optionally strip role keys → collapse whitespace
/// → strip remaining unicode whitespace classes → NFC.
pub fn clean_for_indexing(input: &str, strip_roles: bool) -> String {
    let s = ANSI_ESCAPE_RE.replace_all(input, "");
    let s = strip_noise(&s);
    let s = if strip_roles { strip_role_keys(&s) } else { s };
    let s = clean_whitespace(&s);
    let s = WHITESPACE_CLASS_RE.replace_all(&s, " ");
    s.nfc().collect()
}

/// Replace literal two-character escape sequences (backslash + letter)
/// with their actual character equivalents.
fn unescape_literal_sequences(input: &str) -> String {
    let mut result = String::with_capacity(input.len());
    let mut chars = input.chars();

    while let Some(ch) = chars.next() {
        if ch == '\\' {
            match chars.next() {
                Some('n') => result.push('\n'),
                Some('t') => result.push('\t'),
                Some('r') => result.push('\r'),
                Some(other) => {
                    result.push('\\');
                    result.push(other);
                }
                None => {
                    result.push('\\');
                }
            }
        } else {
            result.push(ch);
        }
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_unescape_literal_newline() {
        // Literal "\n" (two chars) in input should become actual newline,
        // which then gets normalized to a space.
        let input = r"\nLet me validate";
        let result = preprocess_text(input);
        assert_eq!(result, " Let me validate");
    }

    #[test]
    fn test_unescape_literal_tab_and_return() {
        let input = r"hello\tworld\ragain";
        let result = preprocess_text(input);
        assert_eq!(result, "hello world again");
    }

    #[test]
    fn test_real_whitespace_normalization() {
        let input = "hello\n\n\tworld\r\nfoo";
        let result = preprocess_text(input);
        assert_eq!(result, "hello world foo");
    }

    #[test]
    fn test_non_breaking_and_zero_width_spaces() {
        let input = "hello\u{00a0}world\u{200b}foo\u{feff}bar";
        let result = preprocess_text(input);
        assert_eq!(result, "hello world foo bar");
    }

    #[test]
    fn test_strip_ansi_escape_codes() {
        let input = "\x1b[31mError:\x1b[0m something failed";
        let result = preprocess_text(input);
        assert_eq!(result, "Error: something failed");
    }

    #[test]
    fn test_ansi_between_spaces_collapses() {
        // ANSI code between two spaces: after stripping, the spaces must collapse
        let input = "text \x1b[31m more";
        let result = preprocess_text(input);
        assert_eq!(result, "text more");
    }

    #[test]
    fn test_unicode_nfc_normalization() {
        // e + combining acute accent (NFD) should become é (NFC)
        let input = "caf\u{0065}\u{0301}";
        let result = preprocess_text(input);
        assert!(result.contains("caf\u{00e9}"));
    }

    #[test]
    fn test_preserves_punctuation() {
        let input = "user,name hello.world foo-bar";
        let result = preprocess_text(input);
        assert_eq!(result, "user,name hello.world foo-bar");
    }

    #[test]
    fn test_preserves_case() {
        let input = "Hello World FOO bar";
        let result = preprocess_text(input);
        assert_eq!(result, "Hello World FOO bar");
    }

    #[test]
    fn test_preserves_multilingual_content() {
        let input = "hello 你好 مرحبا мир";
        let result = preprocess_text(input);
        assert_eq!(result, "hello 你好 مرحبا мир");
    }

    #[test]
    fn test_combined_escapes_and_ansi() {
        // Test with actual ANSI escape bytes combined with literal \n
        let input = "\x1b[32m\\nLet me validate\x1b[0m this";
        let result = preprocess_text(input);
        assert_eq!(result, " Let me validate this");
    }

    #[test]
    fn test_empty_string() {
        assert_eq!(preprocess_text(""), "");
    }

    #[test]
    fn test_only_whitespace() {
        assert_eq!(preprocess_text("   \n\t  "), " ");
    }

    #[test]
    fn test_backslash_not_followed_by_escape_char() {
        let input = r"path\to\file";
        let result = preprocess_text(input);
        // \t gets unescaped to tab then to space, \f is not recognized so stays as \f
        assert_eq!(result, r"path o\file");
    }

    #[test]
    fn test_trailing_backslash() {
        let input = "hello\\";
        let result = preprocess_text(input);
        assert_eq!(result, "hello\\");
    }

    #[test]
    fn test_original_issue_nlet_token() {
        // The original issue: "\nLet me validate..." produces "nlet" tokens
        let input = "\\nLet me validate the input\\nThen process it";
        let result = preprocess_text(input);
        assert_eq!(result, " Let me validate the input Then process it");
    }

    // ── strip_role_keys ────────────────────────────────────────────────────

    #[test]
    fn test_strip_role_keys_basic() {
        let raw = r#"{"role":"user","content":"hi"}"#;
        let result = strip_role_keys(raw);
        assert_eq!(result, r#"{"content":"hi"}"#);
    }

    #[test]
    fn test_strip_role_keys_escaped() {
        let raw = r#"outer \"role\":\"system\", \"content\":\"hi\""#;
        let result = strip_role_keys(raw);
        assert!(!result.contains("role"));
        assert!(result.contains("content"));
    }

    #[test]
    fn test_strip_role_keys_no_match() {
        let raw = r#"{"content":"my role is admin"}"#;
        let result = strip_role_keys(raw);
        assert_eq!(result, raw);
    }

    // ── clean_for_indexing ─────────────────────────────────────────────────

    #[test]
    fn test_clean_for_indexing_strips_roles_and_collapses() {
        let raw = r#"{"role":"user","content":"hello\n\nworld"}"#;
        let result = clean_for_indexing(raw, true);
        // role removed, literal \n collapsed to single space
        assert_eq!(result, r#"{"content":"hello world"}"#);
    }

    #[test]
    fn test_clean_for_indexing_keeps_roles_when_false() {
        let raw = r#"{"role":"user","content":"hi"}"#;
        let result = clean_for_indexing(raw, false);
        assert!(result.contains("role"));
        assert!(result.contains("user"));
    }

    #[test]
    fn test_clean_for_indexing_strips_base64() {
        let raw = format!(r#"{{"image":"iVBORw0KGgo{}"}}"#, "A".repeat(80));
        let result = clean_for_indexing(&raw, false);
        assert!(result.contains("[base64 image omitted]"));
    }

    #[test]
    fn test_clean_for_indexing_strips_signature() {
        let raw = r#"{"signature":"verylongblob"}"#;
        let result = clean_for_indexing(raw, false);
        assert!(result.contains("[signature omitted]"));
        assert!(!result.contains("verylongblob"));
    }

    #[test]
    fn test_clean_for_indexing_empty() {
        assert_eq!(clean_for_indexing("", true), "");
    }
}
