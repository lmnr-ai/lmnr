use regex::Regex;
use std::sync::LazyLock;
use unicode_normalization::UnicodeNormalization;

static ANSI_ESCAPE_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\x1b\[[0-9;]*[a-zA-Z]").unwrap());

static WHITESPACE_CLASS_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"[\s\u00a0\u200b\ufeff]+").unwrap());

/// Preprocess a string for Quickwit indexing.
///
/// Normalization steps (in order):
/// 1. Unescape literal escape sequences (`\n`, `\t`, `\r`)
/// 2. Replace all whitespace-class characters with a single space
/// 3. Strip ANSI escape codes
/// 4. NFC Unicode normalization
pub fn preprocess_text(input: &str) -> String {
    // 1. Unescape literal two-char escape sequences (\n, \t, \r)
    let s = unescape_literal_sequences(input);

    // 2. Replace whitespace-class characters with a single space
    let s = WHITESPACE_CLASS_RE.replace_all(&s, " ");

    // 3. Strip ANSI escape codes
    let s = ANSI_ESCAPE_RE.replace_all(&s, "");

    // 4. NFC Unicode normalization
    let s: String = s.nfc().collect();

    s
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
}
