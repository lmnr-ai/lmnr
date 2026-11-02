//! Line rendering of a tool set: the tool half of an agent's prompt document
//! (`agent_versioning`).
//!
//! The versioning algorithm works on lines: a version is the ordered set of
//! lines every member of a cluster shares. Pretty-printed JSON is a poor fit,
//! since a closing brace or a common field like `"type": "string"` matches
//! across unrelated tools and a dynamic value buried in a long description
//! breaks the whole line. So each tool is flattened to one line per leaf,
//! prefixed by the tool name and the leaf's path, and prose is split at line
//! breaks and sentence boundaries. A date or id injected into one sentence of
//! one description then drops only that sentence from the version. The text
//! is empty exactly when the set normalizes to no tools.

use serde_json::Value;

use crate::traces::dedup::tool_normalize::{normalize_tools, tool_name};

/// `tools` in any accepted shape; [`normalize_tools`] makes tool order, key
/// order and provider shape irrelevant.
pub fn render(tools: &[Value]) -> String {
    let mut lines = Vec::new();
    for tool in normalize_tools(tools) {
        let name = tool_name(&tool).to_string();
        // A bare-name tool still contributes a line, so adding or removing
        // any tool changes the text.
        lines.push(name.clone());
        match &tool {
            Value::Object(map) => {
                for (key, value) in map {
                    if key != "name" {
                        flatten(&format!("{name}.{key}"), value, &mut lines);
                    }
                }
            }
            other => flatten(&name, other, &mut lines),
        }
    }
    lines.join("\n")
}

fn flatten(path: &str, value: &Value, out: &mut Vec<String>) {
    match value {
        Value::Object(map) if map.is_empty() => out.push(format!("{path} = {{}}")),
        Value::Object(map) => {
            for (key, value) in map {
                flatten(&format!("{path}.{key}"), value, out);
            }
        }
        Value::Array(items) if items.is_empty() => out.push(format!("{path} = []")),
        // Enum values, `required` lists: one line per member, so adding a
        // value keeps every existing line.
        Value::Array(items) if items.iter().all(is_primitive) => {
            for item in items {
                out.push(format!("{path}[] = {item}"));
            }
        }
        Value::Array(items) => {
            for (i, item) in items.iter().enumerate() {
                flatten(&format!("{path}[{i}]"), item, out);
            }
        }
        Value::String(text) => {
            let parts = split_sentences(text);
            if parts.is_empty() {
                out.push(format!("{path}: \"\""));
            }
            for part in parts {
                out.push(format!("{path}: {part}"));
            }
        }
        other => out.push(format!("{path} = {other}")),
    }
}

fn is_primitive(value: &Value) -> bool {
    !matches!(value, Value::Object(_) | Value::Array(_))
}

/// Splits at line breaks, and after sentence punctuation followed by
/// whitespace and a likely sentence start. The lookahead keeps `e.g. foo`
/// and `v1.2` whole; colons never split, so `format: YYYY-MM-DD` stays whole.
/// Parts are trimmed; blank ones are dropped.
fn split_sentences(text: &str) -> Vec<&str> {
    let mut parts = Vec::new();
    for line in text.split('\n') {
        let chars: Vec<(usize, char)> = line.char_indices().collect();
        let mut start = 0;
        let mut i = 0;
        while i < chars.len() {
            let (at, c) = chars[i];
            if matches!(c, '.' | ';' | '!' | '?') {
                let mut next = i + 1;
                while next < chars.len() && chars[next].1.is_whitespace() {
                    next += 1;
                }
                if next > i + 1 && next < chars.len() && starts_sentence(chars[next].1) {
                    parts.push(&line[start..at + c.len_utf8()]);
                    start = chars[next].0;
                    i = next;
                    continue;
                }
            }
            i += 1;
        }
        parts.push(&line[start..]);
    }
    parts
        .into_iter()
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .collect()
}

fn starts_sentence(c: char) -> bool {
    c.is_ascii_uppercase() || matches!(c, '`' | '\'' | '"' | '(' | '-' | '*')
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn splits_prose_at_sentences_and_line_breaks() {
        assert_eq!(
            split_sentences("Search the web. Use it often!\n  - Cite sources: always"),
            vec!["Search the web.", "Use it often!", "- Cite sources: always"]
        );
    }

    #[test]
    fn keeps_abbreviations_versions_and_inline_colons_whole() {
        for text in [
            "Pass e.g. a city name",
            "Requires v1.2 or later",
            "format: YYYY-MM-DD",
            "Note: Use UTC",
            "Ends with a period.",
        ] {
            assert_eq!(split_sentences(text), vec![text]);
        }
    }

    #[test]
    fn renders_one_line_per_leaf_prefixed_by_tool_and_path() {
        let tools = vec![json!({
            "type": "function",
            "name": "get_weather",
            "description": "Get the weather. Today is 2026-10-20.",
            "parameters": {
                "type": "object",
                "properties": {
                    "unit": {"type": "string", "enum": ["c", "f"]},
                    "days": {"type": "integer", "maximum": 7}
                },
                "required": ["unit"]
            }
        })];
        let text = render(&tools);
        let lines: Vec<&str> = text.lines().collect();
        for expected in [
            "get_weather.description: Get the weather.",
            "get_weather.description: Today is 2026-10-20.",
            "get_weather.input_schema.properties.unit.enum[] = \"c\"",
            "get_weather.input_schema.properties.unit.enum[] = \"f\"",
            "get_weather.input_schema.properties.days.maximum = 7",
            "get_weather.input_schema.required[] = \"unit\"",
        ] {
            assert!(lines.contains(&expected), "missing {expected:?} in\n{text}");
        }
        assert_eq!(lines[0], "get_weather");
        assert!(
            lines[1..]
                .iter()
                .all(|line| line.starts_with("get_weather."))
        );
    }

    #[test]
    fn tool_order_and_provider_shape_do_not_change_the_text() {
        let openai = vec![
            json!({"type": "function", "function": {"name": "b", "description": "B."}}),
            json!({"type": "function", "function": {"name": "a", "description": "A."}}),
        ];
        let flat = vec![
            json!({"name": "a", "description": "A."}),
            json!({"name": "b", "description": "B."}),
        ];
        assert_eq!(render(&openai), render(&flat));
    }

    #[test]
    fn transport_fields_are_ignored_and_schema_changes_are_not() {
        let schema = json!({"type": "object", "properties": {"city": {"type": "string"}}});
        let openai = json!({"type": "function", "function": {"name": "get_weather", "parameters": schema, "strict": true}});
        let anthropic = json!({"name": "get_weather", "input_schema": schema, "cache_control": {"type": "ephemeral"}});
        assert_eq!(render(&[openai]), render(&[anthropic.clone()]));
        let changed = json!({"name": "get_weather", "input_schema": {"type": "object", "properties": {"zip": {"type": "string"}}}});
        assert_ne!(render(&[changed]), render(&[anthropic]));
    }

    #[test]
    fn dynamic_sentence_changes_only_its_own_line() {
        let tool = |date: &str| {
            vec![json!({
                "name": "calendar",
                "description": format!("Book meetings. Today is {date}. Never double-book."),
            })]
        };
        let a = render(&tool("Monday"));
        let b = render(&tool("Tuesday"));
        let a_lines: Vec<&str> = a.lines().collect();
        let b_lines: Vec<&str> = b.lines().collect();
        assert_eq!(a_lines.len(), 4);
        let shared = a_lines.iter().filter(|l| b_lines.contains(l)).count();
        assert_eq!(shared, 3);
    }

    #[test]
    fn empty_values_and_bare_tools_still_render_a_line() {
        let text = render(&[
            json!({"name": "ping", "description": ""}),
            json!({
                "name": "noop",
                "parameters": {"type": "object", "properties": {"x": {"type": "string", "default": "", "enum": []}, "y": {"type": "object", "properties": {}}}}
            }),
        ]);
        let lines: Vec<&str> = text.lines().collect();
        for expected in [
            "ping",
            "noop.input_schema.properties.x.default: \"\"",
            "noop.input_schema.properties.x.enum = []",
            "noop.input_schema.properties.y.properties = {}",
        ] {
            assert!(lines.contains(&expected), "missing {expected:?} in\n{text}");
        }
        assert_eq!(render(&[]), "");
    }
}
