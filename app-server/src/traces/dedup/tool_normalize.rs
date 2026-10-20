//! Provider-neutral tool definitions: the identity behind an agent version's
//! tool set and the text stored with it.
//!
//! Function tools in any known shape (OpenAI Chat `{function: {...}}`, OpenAI
//! Responses / AI SDK / MCP flat objects, Anthropic `input_schema`, Gemini
//! `functionDeclarations`) become one object with the schema under
//! `input_schema`, minus transport-only keys. Other tools (provider built-ins
//! like `{type: "web_search"}`) keep their config, minus the same keys.

use serde_json::{Map, Value};

use super::canonical_json;

const SCHEMA_KEYS: [&str; 5] = [
    "input_schema",
    "inputSchema",
    "parameters",
    "parametersJsonSchema",
    "parameters_json_schema",
];

/// Request-shaping keys the model never sees.
const TRANSPORT_KEYS: [&str; 4] = [
    "cache_control",
    "strict",
    "providerOptions",
    "provider_options",
];

/// Leading keys of a normalized function tool; the rest keep their order.
const LEADING_KEYS: [&str; 5] = [
    "name",
    "namespace",
    "namespace_description",
    "defer_loading",
    "description",
];

/// Normalized tools sorted by name, so equal sets serialize identically.
pub fn normalize_tools(tools: &[Value]) -> Vec<Value> {
    let mut out: Vec<Value> = Vec::with_capacity(tools.len());
    for tool in tools {
        push_tool(tool, &mut out);
    }
    let mut keyed: Vec<(String, String, Value)> = out
        .into_iter()
        .map(|tool| (tool_name(&tool).to_string(), canonical_json(&tool), tool))
        .collect();
    keyed.sort_by(|a, b| (&a.0, &a.1).cmp(&(&b.0, &b.1)));
    keyed.into_iter().map(|(_, _, tool)| tool).collect()
}

/// Name a tool is matched by across versions: `name`, else `type`, else `id`.
pub fn tool_name(tool: &Value) -> &str {
    ["name", "type", "id"]
        .iter()
        .find_map(|key| tool.get(key).and_then(Value::as_str))
        .unwrap_or_default()
}

fn push_tool(tool: &Value, out: &mut Vec<Value>) {
    let tool = match tool {
        // Instrumentations that JSON-encode each element.
        Value::String(s) => match serde_json::from_str::<Value>(s) {
            Ok(parsed @ Value::Object(_)) => parsed,
            _ => {
                out.push(tool.clone());
                return;
            }
        },
        other => other.clone(),
    };
    let Value::Object(mut map) = tool else {
        out.push(tool);
        return;
    };

    if let Some(Value::Object(function)) = map.get("function") {
        out.push(normalize_function(function.clone()));
        return;
    }

    let declarations = map
        .remove("functionDeclarations")
        .or_else(|| map.remove("function_declarations"));
    if let Some(declarations) = declarations {
        if let Value::Array(declarations) = &declarations {
            for declaration in declarations {
                match declaration {
                    Value::Object(function) => out.push(normalize_function(function.clone())),
                    other => out.push(other.clone()),
                }
            }
        } else {
            map.insert("functionDeclarations".to_string(), declarations);
        }
        // Built-ins sharing the Gemini tool object (e.g. `googleSearch`).
        strip_transport(&mut map);
        if !map.is_empty() {
            out.push(Value::Object(map));
        }
        return;
    }

    if is_function_tool(&map) {
        out.push(normalize_function(map));
    } else {
        strip_transport(&mut map);
        out.push(Value::Object(map));
    }
}

/// OpenAI's `{type: "custom", format}` tools have no schema, so a non-function
/// `type` counts only alongside one (Anthropic's `type: "custom"`).
fn is_function_tool(map: &Map<String, Value>) -> bool {
    if !map.get("name").is_some_and(Value::is_string) {
        return false;
    }
    match map.get("type") {
        None => true,
        Some(Value::String(t)) if t == "function" => true,
        Some(_) => SCHEMA_KEYS.iter().any(|key| map.contains_key(*key)),
    }
}

fn normalize_function(mut map: Map<String, Value>) -> Value {
    if map.get("type").and_then(Value::as_str) == Some("function") {
        map.remove("type");
    }
    strip_transport(&mut map);

    let mut schema = None;
    for key in SCHEMA_KEYS {
        if let Some(value) = map.remove(key)
            && schema.is_none()
        {
            schema = Some(value);
        }
    }
    let schema = schema.map(reify_string).map(clean_schema);

    if map.get("description").is_some_and(is_blank) {
        map.remove("description");
    }

    let mut out = Map::with_capacity(map.len() + 1);
    for key in LEADING_KEYS {
        if let Some(value) = map.remove(key) {
            out.insert(key.to_string(), value);
        }
    }
    if let Some(schema) = schema.filter(|s| !is_empty_schema(s)) {
        out.insert("input_schema".to_string(), schema);
    }
    out.extend(map);
    Value::Object(out)
}

fn strip_transport(map: &mut Map<String, Value>) {
    for key in TRANSPORT_KEYS {
        map.remove(key);
    }
}

fn reify_string(value: Value) -> Value {
    match value {
        Value::String(s) => serde_json::from_str::<Value>(&s).unwrap_or(Value::String(s)),
        other => other,
    }
}

fn is_blank(value: &Value) -> bool {
    match value {
        Value::Null => true,
        Value::String(s) => s.trim().is_empty(),
        _ => false,
    }
}

/// No parameters, however it is spelled: absent, `{}`, or an object schema
/// with no properties.
fn is_empty_schema(schema: &Value) -> bool {
    match schema {
        Value::Null => true,
        Value::Object(map) => map.iter().all(|(key, value)| match key.as_str() {
            "type" => value.as_str() == Some("object"),
            "properties" => value.as_object().is_some_and(Map::is_empty),
            "required" => value.as_array().is_some_and(Vec::is_empty),
            _ => false,
        }),
        _ => false,
    }
}

/// Drops JSON Schema keywords that SDKs add without changing what the model
/// sees (`$schema`, generated `title`s, boolean `additionalProperties`) and
/// sorts `required`. Walks only schema positions, so a property named `title`
/// survives.
fn clean_schema(schema: Value) -> Value {
    let Value::Object(map) = schema else {
        return schema;
    };
    let mut out = Map::with_capacity(map.len());
    for (key, value) in map {
        let value = match key.as_str() {
            "$schema" | "title" => continue,
            "additionalProperties" if value.is_boolean() => continue,
            "required" => sort_strings(value),
            "properties" | "patternProperties" | "$defs" | "definitions" | "dependentSchemas" => {
                map_values(value, clean_schema)
            }
            "items"
            | "additionalItems"
            | "additionalProperties"
            | "contains"
            | "not"
            | "if"
            | "then"
            | "else"
            | "propertyNames"
            | "unevaluatedItems"
            | "unevaluatedProperties" => match value {
                Value::Array(items) => Value::Array(items.into_iter().map(clean_schema).collect()),
                other => clean_schema(other),
            },
            "anyOf" | "oneOf" | "allOf" | "prefixItems" => match value {
                Value::Array(items) => Value::Array(items.into_iter().map(clean_schema).collect()),
                other => other,
            },
            _ => value,
        };
        out.insert(key, value);
    }
    Value::Object(out)
}

fn map_values(value: Value, f: fn(Value) -> Value) -> Value {
    match value {
        Value::Object(map) => Value::Object(map.into_iter().map(|(k, v)| (k, f(v))).collect()),
        other => other,
    }
}

fn sort_strings(value: Value) -> Value {
    match value {
        Value::Array(mut items) if items.iter().all(Value::is_string) => {
            items.sort_by(|a, b| a.as_str().cmp(&b.as_str()));
            Value::Array(items)
        }
        other => other,
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn one(tool: Value) -> Value {
        let mut tools = normalize_tools(&[tool]);
        assert_eq!(tools.len(), 1);
        tools.remove(0)
    }

    #[test]
    fn provider_shapes_converge() {
        let schema = json!({"type": "object", "properties": {"city": {"type": "string"}}});
        let expected = json!({
            "name": "get_weather",
            "description": "Weather",
            "input_schema": schema,
        });
        let shapes = [
            json!({"type": "function", "function": {"name": "get_weather", "description": "Weather", "parameters": schema, "strict": true}}),
            json!({"type": "function", "name": "get_weather", "description": "Weather", "parameters": schema, "strict": false}),
            json!({"name": "get_weather", "description": "Weather", "input_schema": schema, "cache_control": {"type": "ephemeral"}}),
            json!({"type": "function", "name": "get_weather", "description": "Weather", "inputSchema": schema, "providerOptions": {"x": 1}}),
            json!({"functionDeclarations": [{"name": "get_weather", "description": "Weather", "parametersJsonSchema": schema}]}),
            Value::String(
                json!({"type": "function", "name": "get_weather", "description": "Weather", "parameters": schema.to_string()})
                    .to_string(),
            ),
        ];
        for shape in shapes {
            assert_eq!(one(shape.clone()), expected, "{shape}");
        }
    }

    #[test]
    fn schema_noise_is_dropped_but_property_names_survive() {
        let tool = one(json!({
            "name": "set_page",
            "parameters": {
                "$schema": "http://json-schema.org/draft-07/schema#",
                "title": "SetPageArgs",
                "type": "object",
                "additionalProperties": false,
                "required": ["title", "body"],
                "properties": {
                    "title": {"type": "string", "title": "Title"},
                    "body": {"type": "array", "items": {"type": "object", "title": "Block", "additionalProperties": false}},
                    "meta": {"type": "object", "additionalProperties": {"type": "string"}},
                },
            },
        }));
        assert_eq!(
            tool["input_schema"],
            json!({
                "type": "object",
                "required": ["body", "title"],
                "properties": {
                    "title": {"type": "string"},
                    "body": {"type": "array", "items": {"type": "object"}},
                    "meta": {"type": "object", "additionalProperties": {"type": "string"}},
                },
            })
        );
    }

    #[test]
    fn empty_schemas_and_descriptions_are_omitted() {
        for parameters in [
            json!(null),
            json!({}),
            json!({"type": "object"}),
            json!({"type": "object", "properties": {}, "required": [], "additionalProperties": false}),
        ] {
            assert_eq!(
                one(json!({"name": "ping", "description": "", "parameters": parameters})),
                json!({"name": "ping"}),
                "{parameters}"
            );
        }
        assert_eq!(one(json!({"name": "ping"})), json!({"name": "ping"}));
    }

    #[test]
    fn tool_search_fields_are_kept_and_lead() {
        let tool = one(json!({"type": "function", "function": {
            "parameters": {"type": "object", "properties": {"id": {"type": "string"}}},
            "description": "Get a blueprint",
            "defer_loading": true,
            "namespace_description": "Repositories",
            "namespace": "repo",
            "strict": true,
            "name": "blueprint_get",
        }}));
        let keys: Vec<&str> = tool
            .as_object()
            .unwrap()
            .keys()
            .map(String::as_str)
            .collect();
        assert_eq!(
            keys,
            [
                "name",
                "namespace",
                "namespace_description",
                "defer_loading",
                "description",
                "input_schema"
            ]
        );
    }

    #[test]
    fn built_in_tools_keep_their_config() {
        assert_eq!(
            one(
                json!({"type": "web_search_20250305", "name": "web_search", "max_uses": 5, "cache_control": {"type": "ephemeral"}})
            ),
            json!({"type": "web_search_20250305", "name": "web_search", "max_uses": 5})
        );
        assert_eq!(
            one(json!({"type": "custom", "name": "grammar", "format": {"type": "grammar"}})),
            json!({"type": "custom", "name": "grammar", "format": {"type": "grammar"}})
        );
        assert_eq!(
            one(json!({"type": "web_search"})),
            json!({"type": "web_search"})
        );
        assert_eq!(
            one(
                json!({"type": "provider", "id": "openai.web_search", "name": "web_search", "args": {"size": "high"}})
            ),
            json!({"type": "provider", "id": "openai.web_search", "name": "web_search", "args": {"size": "high"}})
        );
    }

    #[test]
    fn gemini_declarations_flatten_alongside_built_ins() {
        let tools = normalize_tools(&[json!({
            "functionDeclarations": [{"name": "b"}, {"name": "a"}],
            "googleSearch": {},
        })]);
        assert_eq!(
            tools,
            [
                json!({"googleSearch": {}}),
                json!({"name": "a"}),
                json!({"name": "b"})
            ]
        );
    }

    #[test]
    fn output_is_sorted_by_name() {
        let tools = normalize_tools(&[
            json!({"name": "zeta"}),
            json!({"type": "web_search"}),
            json!({"name": "alpha"}),
        ]);
        let names: Vec<&str> = tools.iter().map(tool_name).collect();
        assert_eq!(names, ["alpha", "web_search", "zeta"]);
    }
}
