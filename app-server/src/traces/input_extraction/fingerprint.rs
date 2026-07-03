//! Structural fingerprinting of user messages: the sequence of
//! top-level XML-like scaffolding tags, used as part of the regex cache
//! key so traces with the same scaffolding shape share a cached regex.

use std::sync::LazyLock;

use fancy_regex::Regex;

/// Balanced top-level XML-like tag: `<name ...>lazy body</name>`. The
/// `\1` backreference pairs the closing tag with the opening one.
static TOP_LEVEL_TAG: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"<([a-zA-Z_][\w-]*)\b[^>]*>[\s\S]*?</\1\s*>").unwrap());

/// Structural fingerprint of a user message: the sequence of top-level
/// XML-like tags (nested tags are swallowed by the lazy body match), or
/// `"plain"` for messages with no balanced tags.
pub fn fingerprint_user_message(input: &str) -> String {
    let mut parts: Vec<String> = Vec::new();
    let mut rest = input;

    while !rest.is_empty() {
        // A match error (backtrack limit on adversarial input) is treated
        // like "no more tags" — the remainder collapses to "plain".
        let Ok(Some(captures)) = TOP_LEVEL_TAG.captures(rest) else {
            if !rest.trim().is_empty() {
                parts.push("plain".to_string());
            }
            break;
        };
        let matched = captures.get(0).unwrap();
        if !rest[..matched.start()].trim().is_empty() {
            parts.push("plain".to_string());
        }
        let name = captures.get(1).unwrap().as_str().to_lowercase();
        parts.push(name.clone());
        parts.push(format!("/{name}"));
        rest = &rest[matched.end()..];
    }

    // Collapse adjacent "plain" entries so two consecutive prose runs
    // don't produce a different fingerprint.
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fingerprint_plain_text() {
        assert_eq!(fingerprint_user_message("just some prose"), "plain");
        assert_eq!(fingerprint_user_message("   "), "plain");
    }

    #[test]
    fn fingerprint_tag_sequences() {
        assert_eq!(fingerprint_user_message("<env>x</env>"), "env,/env");
        assert_eq!(
            fingerprint_user_message("<env>x</env>do this<ctx>y</ctx>"),
            "env,/env,plain,ctx,/ctx"
        );
        assert_eq!(
            fingerprint_user_message("before <reminder a=\"1\">r</reminder> after"),
            "plain,reminder,/reminder,plain"
        );
    }

    #[test]
    fn fingerprint_nested_tags_are_swallowed() {
        assert_eq!(
            fingerprint_user_message("<outer><inner>x</inner></outer>"),
            "outer,/outer"
        );
    }

    #[test]
    fn fingerprint_unbalanced_tag_collapses_to_plain() {
        assert_eq!(fingerprint_user_message("<env>never closed"), "plain");
        assert_eq!(fingerprint_user_message("stray </env> close"), "plain");
    }

    #[test]
    fn fingerprint_lowercases_and_dedupes_adjacent_plain() {
        assert_eq!(fingerprint_user_message("<ENV>x</ENV>"), "env,/env");
        // Prose on both sides of an unmatched region stays one "plain".
        assert_eq!(fingerprint_user_message("a <br oken b"), "plain");
    }
}
