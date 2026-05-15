use regex::Regex;
use std::sync::LazyLock;
use unicode_normalization::UnicodeNormalization;

static ANSI_ESCAPE_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\x1b\[[0-9;]*[a-zA-Z]").unwrap());

static WHITESPACE_CLASS_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"[\s\u00a0\u200b\ufeff]+").unwrap());

// Magic-byte prefixes for common base64-encoded image formats. Long-enough
// suffixes catch the inline payload itself (data: URI prefix is optional).
static BASE64_IMAGE_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?:/9j/|iVBORw0KGgo|R0lGODlh|UklGR|PHN2Zz)[A-Za-z0-9+/=_-]{64,}"#).unwrap()
});

static SIGNATURE_FIELD_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"("(?:signature|thought_signature)")\s*:\s*"[^"]*""#).unwrap());

// Same as above but for `\"signature\":\"...\"` inside JSON-stringified blobs.
static SIGNATURE_FIELD_ESCAPED_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(\\"(?:signature|thought_signature)\\")\s*:\s*\\"[^"\\]*\\""#).unwrap()
});

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

/// Strip base64 images and `signature`/`thought_signature` values. Keeps a
/// short placeholder so reconstructed text remains roughly aligned. Does NOT
/// touch whitespace — pair with `clean_whitespace` afterwards.
pub fn strip_noise(raw: &str) -> String {
    let without_images = BASE64_IMAGE_RE.replace_all(raw, "[base64 image omitted]");
    let without_sigs =
        SIGNATURE_FIELD_RE.replace_all(&without_images, r#"$1:"[signature omitted]""#);
    SIGNATURE_FIELD_ESCAPED_RE
        .replace_all(&without_sigs, r##"$1:\"[signature omitted]\""##)
        .into_owned()
}

/// Collapse runs of whitespace (real and literal `\n`/`\t`/`\r`) to a single
/// space and drop other backslashes (`\"`, `\\`, `\/`) so JSON-stringified
/// content reads as plain text.
pub fn clean_whitespace(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let mut in_ws = false;
    let mut chars = s.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch == '\n' || ch == '\t' || ch == '\r' || ch == ' ' {
            if !in_ws {
                result.push(' ');
                in_ws = true;
            }
        } else if ch == '\\' {
            if let Some(&next) = chars.peek() {
                if next == 'n' || next == 't' || next == 'r' {
                    chars.next();
                    if !in_ws {
                        result.push(' ');
                        in_ws = true;
                    }
                    continue;
                }
            }
            // Other backslashes (\", \\, \/) are JSON escaping noise; drop.
        } else {
            result.push(ch);
            in_ws = false;
        }
    }
    result
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
    let s = if strip_roles {
        strip_role_keys(&s)
    } else {
        s
    };
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

    // ── strip_noise ────────────────────────────────────────────────────────

    #[test]
    fn test_strip_noise_base64_png() {
        let raw = format!(
            "before iVBORw0KGgo{} after",
            "A".repeat(80)
        );
        let result = strip_noise(&raw);
        assert!(result.contains("[base64 image omitted]"));
        assert!(!result.contains("AAAAAAAA"));
    }

    #[test]
    fn test_strip_noise_signature_field() {
        let raw = r#"{"signature":"abc123xyz","other":"keep"}"#;
        let result = strip_noise(raw);
        assert_eq!(
            result,
            r#"{"signature":"[signature omitted]","other":"keep"}"#
        );
    }

    #[test]
    fn test_strip_noise_thought_signature_field() {
        let raw = r#"{"thought_signature":"long-encrypted-blob","x":1}"#;
        let result = strip_noise(raw);
        assert_eq!(
            result,
            r#"{"thought_signature":"[signature omitted]","x":1}"#
        );
    }

    #[test]
    fn test_strip_noise_escaped_signature_field() {
        let raw = r#"outer: \"signature\":\"abc\" end"#;
        let result = strip_noise(raw);
        assert!(result.contains(r#"\"signature\":\"[signature omitted]\""#));
    }

    #[test]
    fn test_strip_noise_passthrough() {
        let raw = "hello world no noise here";
        assert_eq!(strip_noise(raw), raw);
    }

    // ── clean_whitespace ───────────────────────────────────────────────────

    #[test]
    fn test_clean_whitespace_collapses_real_whitespace() {
        assert_eq!(clean_whitespace("a   b\n\nc\td"), "a b c d");
    }

    #[test]
    fn test_clean_whitespace_collapses_literal_escapes() {
        assert_eq!(clean_whitespace(r"a\nb\tc\rd"), "a b c d");
    }

    #[test]
    fn test_clean_whitespace_strips_other_backslashes() {
        // Each backslash drops itself; consecutive backslashes are all consumed.
        assert_eq!(clean_whitespace(r#"a\"b\\c\/d"#), "a\"bc/d");
    }

    #[test]
    fn test_clean_whitespace_preserves_words() {
        assert_eq!(clean_whitespace("hello world"), "hello world");
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
