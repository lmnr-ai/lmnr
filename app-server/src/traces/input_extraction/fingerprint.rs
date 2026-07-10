//! Structural fingerprinting of user messages: the sequence of
//! top-level XML-like scaffolding tags plus the ordered sequence of
//! markdown headings (h1-h3), used as part of the regex cache key so
//! traces with the same scaffolding shape share a cached regex.

use std::sync::LazyLock;

use fancy_regex::Regex;

/// Balanced top-level XML-like tag: `<name ...>lazy body</name>`. The
/// `\1` backreference pairs the closing tag with the opening one.
static TOP_LEVEL_TAG: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"<([a-zA-Z_][\w-]*)\b[^>]*>[\s\S]*?</\1\s*>").unwrap());

/// ATX-style markdown heading, levels 1-3 only (`#`/`##`/`###`). Up to 3
/// leading spaces are allowed (CommonMark); a 4th makes it a code block,
/// not a heading. `(?!#)` after the level group rejects h4+
/// (`####...`). The heading text is optional (a bare `###` still
/// counts), but when text is present it must be separated by whitespace
/// — CommonMark treats `###foo` (no space) as a paragraph, not a
/// heading.
static MARKDOWN_HEADING: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^ {0,3}(#{1,3})(?!#)(?:[ \t]+.*)?$").unwrap());

/// Ordered sequence of markdown heading levels (`"h1"`, `"h2"`, `"h3"`)
/// found in the message, scanned line by line over the raw input
/// (including text inside XML-like tag bodies). Unlike XML tags,
/// headings have no closing marker, so — unlike tag names — order here
/// is significant and is preserved as encountered, not sorted or
/// deduplicated.
fn heading_sequence(input: &str) -> Vec<String> {
    let mut levels = Vec::new();
    for line in input.lines() {
        if let Ok(Some(captures)) = MARKDOWN_HEADING.captures(line) {
            let level = captures.get(1).unwrap().as_str().len();
            levels.push(format!("h{level}"));
        }
    }
    levels
}

/// Structural fingerprint of a user message: the sequence of top-level
/// XML-like tags (nested tags are swallowed by the lazy body match, and
/// tag order doesn't affect the fingerprint), or `"plain"` for messages
/// with no balanced tags — followed by `|` and the order-sensitive
/// sequence of markdown headings (h1-h3), when any are present.
pub fn fingerprint_user_message(input: &str) -> String {
    let tag_fingerprint = fingerprint_tags(input);
    let headings = heading_sequence(input);
    if headings.is_empty() {
        tag_fingerprint
    } else {
        format!("{tag_fingerprint}|{}", headings.join(","))
    }
}

/// Tag-only half of the fingerprint. See `fingerprint_user_message`.
fn fingerprint_tags(input: &str) -> String {
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

    // Collect tag names (ignoring "plain") into a sorted, deduplicated
    // list, keeping opening/closing as a pair.  Tag order in the message
    // doesn't affect the cache key; "context,/context" and
    // "/context,context" are both normalised to "context,/context".
    let has_plain = deduped.iter().any(|s| s == "plain");
    let mut tag_names: Vec<String> = deduped
        .into_iter()
        .filter(|s| s != "plain" && !s.starts_with('/'))
        .collect();
    tag_names.sort();
    tag_names.dedup();

    let mut result: Vec<String> = tag_names
        .iter()
        .flat_map(|name| [name.clone(), format!("/{name}")])
        .collect();
    if has_plain {
        result.push("plain".to_string());
    }

    if result.is_empty() {
        "plain".to_string()
    } else {
        result.join(",")
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
        // Tags are sorted alphabetically; "plain" moves to the end.
        assert_eq!(
            fingerprint_user_message("<env>x</env>do this<ctx>y</ctx>"),
            "ctx,/ctx,env,/env,plain"
        );
        assert_eq!(
            fingerprint_user_message("before <reminder a=\"1\">r</reminder> after"),
            "reminder,/reminder,plain"
        );
    }

    #[test]
    fn fingerprint_order_independent() {
        // Same tags in different order must produce the same fingerprint.
        let a = fingerprint_user_message(
            "<context>c</context><user_instructions>u</user_instructions><final_instruction>f</final_instruction>",
        );
        let b = fingerprint_user_message(
            "<user_instructions>u</user_instructions><final_instruction>f</final_instruction><context>c</context>",
        );
        assert_eq!(a, b);
        assert_eq!(
            a,
            "context,/context,final_instruction,/final_instruction,user_instructions,/user_instructions"
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

    #[test]
    fn fingerprint_no_headings_unaffected() {
        assert_eq!(fingerprint_user_message("just some prose"), "plain");
        assert_eq!(fingerprint_user_message("<env>x</env>"), "env,/env");
    }

    #[test]
    fn fingerprint_headings_levels() {
        assert_eq!(fingerprint_user_message("# Title"), "plain|h1");
        assert_eq!(fingerprint_user_message("## Title"), "plain|h2");
        assert_eq!(fingerprint_user_message("### Title"), "plain|h3");
    }

    #[test]
    fn fingerprint_headings_ignore_h4_plus() {
        assert_eq!(fingerprint_user_message("#### Title"), "plain");
        assert_eq!(fingerprint_user_message("###### Title"), "plain");
    }

    #[test]
    fn fingerprint_headings_order_matters() {
        // Unlike tags, heading order is preserved, not sorted.
        let a = fingerprint_user_message("# One\ntext\n## Two\ntext\n### Three");
        let b = fingerprint_user_message("### Three\ntext\n## Two\ntext\n# One");
        assert_eq!(a, "plain|h1,h2,h3");
        assert_eq!(b, "plain|h3,h2,h1");
        assert_ne!(a, b);
    }

    #[test]
    fn fingerprint_headings_repeated_levels_not_deduped() {
        assert_eq!(
            fingerprint_user_message("# A\n# B\n## C"),
            "plain|h1,h1,h2"
        );
    }

    #[test]
    fn fingerprint_headings_combine_with_tags() {
        assert_eq!(
            fingerprint_user_message("<env>x</env>\n# Title\nbody"),
            "env,/env,plain|h1"
        );
    }

    #[test]
    fn fingerprint_headings_bare_hash_counts() {
        // A heading marker with no text still counts as a heading.
        assert_eq!(fingerprint_user_message("###"), "plain|h3");
        assert_eq!(fingerprint_user_message("###\nbody"), "plain|h3");
    }

    #[test]
    fn fingerprint_headings_require_leading_whitespace_for_text() {
        // No space after the hashes: not a heading per CommonMark, so no
        // "|h*" suffix is appended.
        assert_eq!(fingerprint_user_message("###notaheading"), "plain");
    }

    #[test]
    fn fingerprint_headings_leading_spaces_allowed() {
        assert_eq!(fingerprint_user_message("   # Title"), "plain|h1");
        // 4+ leading spaces makes it a code block, not a heading.
        assert_eq!(fingerprint_user_message("    # Title"), "plain");
    }

    #[test]
    fn fingerprint_headings_inside_tag_body_are_detected() {
        assert_eq!(
            fingerprint_user_message("<context>\n# Heading\nbody\n</context>"),
            "context,/context|h1"
        );
    }
}
