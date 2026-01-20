use serde_json::Value;

use crate::trace_analysis::gemini::{FunctionDeclaration, Tool};

pub fn build_tool_definitions(output_schema: &Value) -> Tool {
    let properties = output_schema
        .get("properties")
        .cloned()
        .unwrap_or_else(|| Value::Object(serde_json::Map::new()));

    let required = output_schema
        .get("required")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let function_declarations = vec![
        FunctionDeclaration {
            name: "get_full_span_info".to_string(),
            description: "Retrieves complete information (full input, output, timing, etc.) for specific spans by their IDs. Use this when you need more details about spans to make an identification decision. The compressed trace view may have truncated or omitted some data.".to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "span_ids": {
                        "type": "array",
                        "items": {"type": "integer"},
                        "description": "List of span IDs (sequential integers starting from 1) to fetch full information for."
                    }
                },
                "required": ["span_ids"]
            }),
        },
        FunctionDeclaration {
            name: "submit_identification".to_string(),
            description: "Submits the final identification result. Call this when you have determined whether the semantic event can be identified in the trace and have extracted the relevant data (if identified=true) or determined it cannot be found (if identified=false).".to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "identified": {
                        "type": "boolean",
                        "description": "Whether the information described by the developer's prompt can be extracted from or identified in the trace."
                    },
                    "data": {
                        "type": "object",
                        "description": "Data that was extracted from / identified in the trace. If 'identified' flag is false, you can omit this field or provide an empty object.",
                        "properties": properties,
                        "required": required
                    }
                },
                "required": ["identified"]
            }),
        },
    ];

    Tool {
        function_declarations,
    }
}
