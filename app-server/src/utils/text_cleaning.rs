use regex::Regex;
use std::sync::LazyLock;

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

#[cfg(test)]
mod tests {
    use super::*;

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
}
