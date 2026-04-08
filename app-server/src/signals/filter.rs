use std::sync::Arc;

use chrono::Utc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::cache::keys::SPAN_DROP_RULES_CACHE_KEY;
use crate::cache::{Cache, CacheTrait};
use crate::ch::spans::CHSpan;
use crate::signals::spans::extract_exception_from_events;
use crate::db::spans::SpanType;
use crate::mq::MessageQueue;
use crate::signals::prompts::{FILTER_GENERATION_SYSTEM_PROMPT, FILTER_GENERATION_USER_PROMPT};
use crate::signals::provider::models::{
    ModelSize, ProviderContent, ProviderFunctionDeclaration, ProviderGenerationConfig,
    ProviderPart, ProviderRequest, ProviderTool,
};
use crate::signals::provider::{LlmClient, ProviderThinkingConfig, ProviderThinkingLevel};
use crate::signals::utils::{
    InternalSpan, emit_internal_span, request_to_span_input, request_to_tools_attr,
};

use super::summarize::hash_signal_prompt;

const FILTER_CACHE_TTL_SECONDS: u64 = 30 * 24 * 60 * 60; // 30 days
const MAX_TRACE_STRING_LEN: usize = 1_000_000;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FieldMatcher {
    pub field: String,
    pub pattern: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DropRule {
    #[serde(rename = "match")]
    pub match_: Vec<FieldMatcher>,
    pub reason: String,
}

fn cache_key(
    project_id: Uuid,
    signal_id: Uuid,
    signal_prompt_hash: &str,
    fingerprint: &str,
) -> String {
    format!(
        "{SPAN_DROP_RULES_CACHE_KEY}:{project_id}:{signal_id}:{signal_prompt_hash}:{fingerprint}"
    )
}

pub async fn lookup_cached_drop_rules(
    cache: &Arc<Cache>,
    project_id: Uuid,
    signal_id: Uuid,
    signal_prompt: &str,
    fingerprint: &str,
) -> Option<Vec<DropRule>> {
    let sig_hash = hash_signal_prompt(signal_prompt);
    let key = cache_key(project_id, signal_id, &sig_hash, fingerprint);
    match cache.get::<Vec<DropRule>>(&key).await {
        Ok(rules) => rules,
        Err(e) => {
            log::warn!("Cache read error for span drop rules: {:?}", e);
            None
        }
    }
}

async fn cache_drop_rules(
    cache: &Arc<Cache>,
    project_id: Uuid,
    signal_id: Uuid,
    signal_prompt: &str,
    fingerprint: &str,
    rules: &[DropRule],
) {
    let sig_hash = hash_signal_prompt(signal_prompt);
    let key = cache_key(project_id, signal_id, &sig_hash, fingerprint);
    if let Err(e) = cache
        .insert_with_ttl(&key, rules.to_vec(), FILTER_CACHE_TTL_SECONDS)
        .await
    {
        log::warn!("Failed to cache span drop rules: {:?}", e);
    }
}

fn build_filter_tool_definitions() -> Vec<ProviderTool> {
    vec![ProviderTool {
        function_declarations: vec![
            ProviderFunctionDeclaration {
            name: "add_span_drop_rule".to_string(),
            description: concat!(
                    "Add a rule to drop spans from the trace before the signal agent sees it. ",
                    "Every span you drop saves tokens and helps the signal agent focus on what matters.\n\n",

                    "WHEN TO USE:\n",
                    "- `default` type spans: drop aggressively. These are almost always orchestration ",
                    "scaffolding (entry points, message relay, wrappers) that duplicates content already ",
                    "visible in adjacent `llm` or `tool` spans.\n",
                    "- `llm` and `tool` type spans: rarely drop. These carry the agent's core reasoning ",
                    "and execution. Only drop if a specific pattern is pure infrastructure ",
                    "(e.g. an internal SDK span that wraps the real LLM call with no added content).\n\n",

                    "RULE MECHANICS:\n",
                    "A span is dropped if it matches ANY rule. Within a rule, ALL field matchers must match (AND semantics). ",
                    "Every rule MUST include at least one 'name' or 'path' matcher.\n\n",

                    "Prefer 'name' or 'path' matchers ONLY. Avoid 'input'/'output' matchers unless ",
                    "you need to disambiguate spans that share a name but differ in relevance — ",
                    "input/output content varies between runs, so overly specific patterns will silently ",
                    "stop matching on future traces.\n\n",

                    "'name' vs 'path':\n",
                    "- 'name': the span's own short name (e.g. \"anthropic.messages\", \"Bash\"). ",
                    "Matches regardless of position in the call tree.\n",
                    "- 'path': the dot-separated ancestry including the span itself ",
                    "(e.g. \"agent.Bash.anthropic.messages\"). Matches a specific position in the hierarchy.\n\n",

                    "Pattern syntax (glob only): '*' matches any character sequence including empty.\n",
                    "  exact:    \"create_sdk_mcp_server\"\n",
                    "  prefix:   \"agent_run*\"\n",
                    "  suffix:   \"*.messages\"\n",
                    "  contains: \"*tool_call*\"\n",
                    "  any:      \"*\"\n\n",

                    "Matchable fields: \"name\", \"path\", \"input\", \"output\"\n\n",

                    "Do NOT add a rule if:\n",
                    "- You are unsure whether the span pattern ever contains signal — when in doubt, keep it\n",
                    "- The rule has no 'name' or 'path' matcher\n",
                    "- The pattern is so broad it could match unrelated spans across different trace shapes",
                )
                .to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "match": {
                        "type": "array",
                        "description": "List of field matchers. ALL must match for the rule to apply. Must contain at least one matcher with field 'name' or 'path'.",
                        "minItems": 1,
                        "items": {
                            "type": "object",
                            "properties": {
                                "field": {
                                    "type": "string",
                                    "enum": ["name", "path", "input", "output"],
                                    "description": "The span field to match against. 'name' is the span's own short name; 'path' is the full dot-separated ancestry."
                                },
                                "pattern": {
                                    "type": "string",
                                    "description": "Glob pattern. '*' matches any sequence including empty."
                                }
                            },
                            "required": ["field", "pattern"]
                        }
                    },
                    "reason": {
                        "type": "string",
                        "description": "One sentence explaining why spans matching this rule carry no signal."
                    }
                },
                "required": ["match", "reason"]
            }),
            },
        ],
    }]
}

fn parse_drop_rules_from_response(
    response: &crate::signals::provider::models::ProviderResponse,
) -> Vec<DropRule> {
    let mut rules = Vec::new();
    let parts = response
        .candidates
        .as_ref()
        .and_then(|c| c.first())
        .and_then(|c| c.content.as_ref())
        .and_then(|c| c.parts.as_ref());

    let Some(parts) = parts else {
        return rules;
    };

    for part in parts {
        let Some(fc) = &part.function_call else {
            continue;
        };
        if fc.name != "add_span_drop_rule" {
            continue;
        }
        let Some(args) = &fc.args else {
            continue;
        };

        let match_array = match args.get("match").and_then(|m| m.as_array()) {
            Some(arr) => arr,
            None => continue,
        };

        let mut matchers = Vec::new();
        let mut has_identity_matcher = false;
        for m in match_array {
            let field = m.get("field").and_then(|f| f.as_str()).unwrap_or_default();
            let pattern = m
                .get("pattern")
                .and_then(|p| p.as_str())
                .unwrap_or_default();
            if field.is_empty() || pattern.is_empty() {
                continue;
            }
            if !matches!(field, "name" | "path" | "input" | "output") {
                continue;
            }
            if field == "name" || field == "path" {
                has_identity_matcher = true;
            }
            matchers.push(FieldMatcher {
                field: field.to_string(),
                pattern: pattern.to_string(),
            });
        }

        if !has_identity_matcher || matchers.is_empty() {
            continue;
        }

        let reason = args
            .get("reason")
            .and_then(|r| r.as_str())
            .unwrap_or("")
            .to_string();

        rules.push(DropRule {
            match_: matchers,
            reason,
        });
    }

    rules
}

/// Call the LLM to generate span drop rules and cache them.
/// `fingerprint` is typically the summary-based fingerprint from summarization.
/// Returns the generated rules (may be empty if the LLM finds nothing to drop).
pub async fn generate_and_cache_drop_rules(
    cache: &Arc<Cache>,
    llm_client: &Arc<LlmClient>,
    queue: Arc<MessageQueue>,
    internal_project_id: Option<Uuid>,
    project_id: Uuid,
    signal_id: Uuid,
    signal_prompt: &str,
    fingerprint: &str,
    trace_string: &str,
) -> Vec<DropRule> {
    if trace_string.len() > MAX_TRACE_STRING_LEN {
        log::info!(
            "Trace string too large ({} chars) for filter generation, skipping",
            trace_string.len()
        );
        return Vec::new();
    }

    let start_time = Utc::now();

    let user_prompt = FILTER_GENERATION_USER_PROMPT
        .replace("{{signal_prompt}}", signal_prompt)
        .replace("{{trace_string}}", trace_string);

    let request = ProviderRequest {
        contents: vec![ProviderContent {
            role: Some("user".to_string()),
            parts: Some(vec![ProviderPart {
                text: Some(user_prompt),
                ..Default::default()
            }]),
        }],
        system_instruction: Some(ProviderContent {
            role: None,
            parts: Some(vec![ProviderPart {
                text: Some(FILTER_GENERATION_SYSTEM_PROMPT.to_string()),
                ..Default::default()
            }]),
        }),
        tools: Some(build_filter_tool_definitions()),
        generation_config: Some(ProviderGenerationConfig {
            temperature: Some(1.0),
            max_output_tokens: Some(2048),
            thinking_config: Some(ProviderThinkingConfig {
                include_thoughts: Some(true),
                thinking_level: Some(ProviderThinkingLevel::Medium),
            }),
            ..Default::default()
        }),
        provider: Some("bedrock".to_string()),
        model_size: Some(ModelSize::Large),
    };

    let span_input = request_to_span_input(&request);
    let span_tools = request_to_tools_attr(&request);

    let (response, error) = match llm_client.generate_content(&request).await {
        Ok(r) => (Some(r), None),
        Err(e) => {
            log::error!("LLM call failed for span filter generation: {}", e);
            (None, Some(format!("{}", e)))
        }
    };

    let usage = response.as_ref().and_then(|r| r.usage_metadata.as_ref());

    let rules = response
        .as_ref()
        .map(parse_drop_rules_from_response)
        .unwrap_or_default();

    // TODO: make better internal tracing in the future
    emit_internal_span(
        queue,
        InternalSpan {
            name: "generate_span_filters".to_string(),
            trace_id: Uuid::new_v4(),
            run_id: Uuid::nil(),
            signal_name: String::new(),
            parent_span_id: None,
            span_type: SpanType::LLM,
            start_time,
            input: Some(span_input),
            output: Some(serde_json::json!({
                "rules": rules,
            })),
            input_tokens: usage.and_then(|u| u.prompt_token_count),
            input_cached_tokens: usage.and_then(|u| u.cache_read_input_tokens),
            output_tokens: usage.and_then(|u| u.candidates_token_count),
            model: "claude-opus-4-6".to_string(),
            provider: "bedrock".to_string(),
            internal_project_id,
            job_id: None,
            error,
            provider_batch_id: None,
            metadata: Some(
                serde_json::json!({
                    "project_id": project_id,
                    "signal_id": signal_id,
                    "fingerprint": fingerprint,
                })
                .as_object()
                .unwrap()
                .iter()
                .map(|(k, v)| (k.to_string(), v.clone()))
                .collect(),
            ),
            tools: span_tools,
        },
    )
    .await;

    if response.is_none() {
        return Vec::new();
    }

    log::info!(
        "Generated {} span drop rules for project={} signal={}",
        rules.len(),
        project_id,
        signal_id,
    );

    cache_drop_rules(
        cache,
        project_id,
        signal_id,
        signal_prompt,
        fingerprint,
        &rules,
    )
    .await;

    rules
}

/// Match a glob pattern against a string. Only `*` is supported as a wildcard
/// matching any sequence of characters (including empty).
fn glob_match(pattern: &str, text: &str) -> bool {
    let pattern_bytes = pattern.as_bytes();
    let text_bytes = text.as_bytes();
    let (plen, tlen) = (pattern_bytes.len(), text_bytes.len());

    // dp[j] = true means pattern[..i] matches text[..j]
    let mut dp = vec![false; tlen + 1];
    dp[0] = true;

    for i in 0..plen {
        if pattern_bytes[i] == b'*' {
            // '*' can match empty or extend any previous match
            for j in 1..=tlen {
                dp[j] = dp[j] || dp[j - 1];
            }
        } else {
            // Non-wildcard: scan right-to-left to avoid using updated values
            for j in (1..=tlen).rev() {
                dp[j] = dp[j - 1] && pattern_bytes[i] == text_bytes[j - 1];
            }
            dp[0] = false;
        }
    }

    dp[tlen]
}

fn rule_matches_span(rule: &DropRule, span: &CHSpan) -> bool {
    rule.match_.iter().all(|m| {
        let value = match m.field.as_str() {
            "name" => &span.name,
            "path" => &span.path,
            "input" => &span.input,
            "output" => &span.output,
            _ => return false,
        };
        glob_match(&m.pattern, value)
    })
}

/// Filter out spans that match any cached drop rule.
pub fn apply_drop_rules(ch_spans: Vec<CHSpan>, rules: &[DropRule]) -> Vec<CHSpan> {
    if rules.is_empty() {
        return ch_spans;
    }
    let original_count = ch_spans.len();
    let result: Vec<CHSpan> = ch_spans
        .into_iter()
        .filter(|span| {
            let has_exception = extract_exception_from_events(&span.events).is_some();
            has_exception || !rules.iter().any(|rule| rule_matches_span(rule, span))
        })
        .collect();
    let dropped = original_count - result.len();
    if dropped > 0 {
        log::info!(
            "Span drop rules filtered {dropped} of {original_count} spans ({} remaining)",
            result.len()
        );
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_glob_match_exact() {
        assert!(glob_match("hello", "hello"));
        assert!(!glob_match("hello", "world"));
    }

    #[test]
    fn test_glob_match_star_prefix() {
        assert!(glob_match("*world", "hello world"));
        assert!(glob_match("*world", "world"));
        assert!(!glob_match("*world", "worldx"));
    }

    #[test]
    fn test_glob_match_star_suffix() {
        assert!(glob_match("hello*", "hello world"));
        assert!(glob_match("hello*", "hello"));
        assert!(!glob_match("hello*", "xhello"));
    }

    #[test]
    fn test_glob_match_star_contains() {
        assert!(glob_match("*tool*", "my_tool_call"));
        assert!(glob_match("*tool*", "tool"));
        assert!(!glob_match("*tool*", "too"));
    }

    #[test]
    fn test_glob_match_star_only() {
        assert!(glob_match("*", "anything"));
        assert!(glob_match("*", ""));
    }

    #[test]
    fn test_glob_match_multiple_stars() {
        assert!(glob_match("a*b*c", "abc"));
        assert!(glob_match("a*b*c", "aXXbYYc"));
        assert!(!glob_match("a*b*c", "aXXcYYb"));
    }

    #[test]
    fn test_glob_match_empty() {
        assert!(glob_match("", ""));
        assert!(!glob_match("", "x"));
        assert!(glob_match("*", ""));
    }

    #[test]
    fn test_apply_drop_rules_filters_matching() {
        let spans = vec![
            make_test_span("benchmark_run", "", ""),
            make_test_span("agent.chat", "hello", "world"),
            make_test_span("benchmark_score", "", ""),
        ];
        let rules = vec![DropRule {
            match_: vec![FieldMatcher {
                field: "name".to_string(),
                pattern: "benchmark*".to_string(),
            }],
            reason: "benchmark spans".to_string(),
        }];
        let result = apply_drop_rules(spans, &rules);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].name, "agent.chat");
    }

    #[test]
    fn test_apply_drop_rules_and_semantics() {
        let spans = vec![
            make_test_span("llm_call", "system: you are a bot", "ok"),
            make_test_span("llm_call", "", ""),
        ];
        let rules = vec![DropRule {
            match_: vec![
                FieldMatcher {
                    field: "name".to_string(),
                    pattern: "llm_call".to_string(),
                },
                FieldMatcher {
                    field: "input".to_string(),
                    pattern: "".to_string(),
                },
            ],
            reason: "empty llm calls".to_string(),
        }];
        let result = apply_drop_rules(spans, &rules);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].input, "system: you are a bot");
    }

    #[test]
    fn test_apply_drop_rules_exception_bypass() {
        let mut span_with_exception = make_test_span("benchmark_run", "", "");
        span_with_exception.events = vec![(
            0,
            "exception".to_string(),
            r#"{"exception.message":"something failed"}"#.to_string(),
        )];
        let span_without = make_test_span("benchmark_score", "", "");

        let rules = vec![DropRule {
            match_: vec![FieldMatcher {
                field: "name".to_string(),
                pattern: "benchmark*".to_string(),
            }],
            reason: "benchmark spans".to_string(),
        }];
        let result = apply_drop_rules(vec![span_with_exception, span_without], &rules);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].name, "benchmark_run");
    }

    #[test]
    fn test_apply_drop_rules_empty_rules() {
        let spans = vec![make_test_span("a", "", ""), make_test_span("b", "", "")];
        let result = apply_drop_rules(spans.clone(), &[]);
        assert_eq!(result.len(), 2);
    }

    #[test]
    fn test_apply_drop_rules_path_matching() {
        let mut span1 = make_test_span("anthropic.messages", "", "");
        span1.path = "agent.Bash.anthropic.messages".to_string();
        let mut span2 = make_test_span("anthropic.messages", "", "");
        span2.path = "agent.anthropic.messages".to_string();
        let mut span3 = make_test_span("openai.chat", "", "");
        span3.path = "agent.openai.chat".to_string();

        let rules = vec![DropRule {
            match_: vec![FieldMatcher {
                field: "path".to_string(),
                pattern: "agent.Bash.*".to_string(),
            }],
            reason: "nested under Bash tool".to_string(),
        }];
        let result = apply_drop_rules(vec![span1, span2, span3], &rules);
        assert_eq!(result.len(), 2);
        assert_eq!(result[0].path, "agent.anthropic.messages");
        assert_eq!(result[1].path, "agent.openai.chat");
    }

    fn make_test_span(name: &str, input: &str, output: &str) -> CHSpan {
        CHSpan {
            span_id: Uuid::new_v4(),
            name: name.to_string(),
            span_type: 0,
            start_time: 0,
            end_time: 0,
            input_cost: 0.0,
            output_cost: 0.0,
            total_cost: 0.0,
            model: String::new(),
            session_id: String::new(),
            project_id: Uuid::nil(),
            trace_id: Uuid::nil(),
            provider: String::new(),
            input_tokens: 0,
            output_tokens: 0,
            total_tokens: 0,
            user_id: String::new(),
            path: String::new(),
            input: input.to_string(),
            output: output.to_string(),
            size_bytes: 0,
            status: String::new(),
            attributes: String::new(),
            request_model: String::new(),
            response_model: String::new(),
            parent_span_id: Uuid::nil(),
            trace_metadata: String::new(),
            trace_type: 0,
            tags_array: vec![],
            events: vec![],
        }
    }
}
