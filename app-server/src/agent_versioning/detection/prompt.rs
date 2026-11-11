//! What the detection model reads: its instructions, the prompts and agents it
//! works on, and its tools' schemas.

use std::collections::HashSet;

use serde_json::json;

use super::agent::{KnownAgent, UnlabelledPrompt};
use crate::{
    agent_versioning::definition::OPENING_CHARS,
    llm::{ProviderFunctionDeclaration, ProviderTool},
    utils::truncate_chars,
};

pub const TEST_CHECK_TOOL: &str = "test_check";
pub const SUBMIT_TOOL: &str = "submit";

const INSTRUCTIONS: &str = "You maintain the list of AI agents in an observability project. \
Each agent has a check: it matches a system prompt when every substring of any one \
alternative (`any_of: [[substring, ...], ...]`) occurs in the prompt's first \
{opening_chars} characters (its opening), ignoring case and whitespace.

You get the project's known agents (name, check, and opening and time of their latest \
prompt) and the openings of system prompts that no check matched, with the time of each.

Prompts often open with text that is not the agent's own: memory, a list of skills or \
tools, a framework's preset. Look past it for the agent's own instructions.

Group the prompts by the agent that sent them, then for each group either:
- extend a known agent whose prompt changed (`updates`; the added alternatives are kept \
next to the old ones), or
- define a new agent with a short human-readable name (2-4 words, its role) and a check.

A prompt change usually ships in a deploy: a known agent goes quiet as prompts appear that \
keep the shape of its latest prompt (same structure and surrounding text) with some text \
reworded. Extend that agent rather than defining a new one.

Rules for checks:
- Use static text that every prompt of the agent carries, usually its role statement \
(\"You are a GTM assistant...\"). Never use dynamic content: dates, names, ids, \
organizations, counts, credits, user context.
- A check must not match other agents' prompts, so avoid boilerplate several agents share.
- Prefer one or two distinctive sentences or phrases.

A new agent must match at least {min_matches} prompts. Leave alone prompts that are \
one-off, such as ad-hoc subagents; it is fine to submit nothing.

Test checks with `test_check` before submitting. `submit` reports rejected items; fix and \
resubmit them or drop them.";

/// Minute precision is enough to line a deploy up with an agent going quiet.
pub fn format_time(ns: i64) -> String {
    chrono::DateTime::from_timestamp_nanos(ns)
        .format("%Y-%m-%d %H:%M UTC")
        .to_string()
}

pub fn instructions(min_matches: usize) -> String {
    INSTRUCTIONS
        .replace("{min_matches}", &min_matches.to_string())
        .replace("{opening_chars}", &OPENING_CHARS.to_string())
}

/// Known agents' latest prompts are shown, most recently seen first, up to
/// this many characters; the rest are only named. An agent whose prompt just
/// changed went quiet recently, so it is among those shown.
const AGENT_PROMPTS_CHARS: usize = 100_000;

/// The first user message. Prompts and agents are numbered from 1, the ids the
/// tools take and report.
pub fn context(prompts: &[UnlabelledPrompt], agents: &[KnownAgent]) -> String {
    let shown = agents_with_prompt_shown(agents);
    let agents: String = agents
        .iter()
        .enumerate()
        .map(|(index, known)| {
            let check = serde_json::to_string(&known.agent.definition.any_of).unwrap_or_default();
            let latest_prompt = match &known.latest {
                Some(latest) if shown.contains(&index) => format!(
                    "<latest_prompt time=\"{}\">\n{}\n</latest_prompt>",
                    format_time(latest.time),
                    truncate_chars(&latest.system_prompt, OPENING_CHARS)
                ),
                Some(latest) => format!(
                    "<latest_prompt time=\"{}\">(not shown: other agents were seen more \
                     recently)</latest_prompt>",
                    format_time(latest.time),
                ),
                None => "<latest_prompt>(none recently)</latest_prompt>".to_string(),
            };
            format!(
                "<agent id=\"{}\" name=\"{}\">\n<check>{check}</check>\n{latest_prompt}\n</agent>\n",
                index + 1,
                known.agent.name.as_deref().unwrap_or_default(),
            )
        })
        .collect();
    let prompts: String = prompts
        .iter()
        .enumerate()
        .map(|(index, prompt)| {
            format!(
                "<prompt id=\"{}\" time=\"{}\">\n{}\n</prompt>\n",
                index + 1,
                format_time(prompt.time),
                truncate_chars(&prompt.system_prompt, OPENING_CHARS)
            )
        })
        .collect();
    format!("<agents>\n{agents}</agents>\n\n<prompts>\n{prompts}</prompts>")
}

/// Indices of the agents whose latest prompt fits in [`AGENT_PROMPTS_CHARS`],
/// most recently seen first.
fn agents_with_prompt_shown(agents: &[KnownAgent]) -> HashSet<usize> {
    let mut latest: Vec<_> = agents
        .iter()
        .enumerate()
        .filter_map(|(index, known)| Some((index, known.latest.as_ref()?)))
        .collect();
    latest.sort_by_key(|(_, latest)| std::cmp::Reverse(latest.time));
    let mut chars = 0;
    let mut shown = HashSet::new();
    for (index, latest) in latest {
        chars += latest.system_prompt.chars().count().min(OPENING_CHARS);
        if chars > AGENT_PROMPTS_CHARS {
            break;
        }
        shown.insert(index);
    }
    shown
}

pub fn tools() -> ProviderTool {
    let check = json!({
        "type": "array",
        "description": "Alternatives; each is a list of substrings that must all occur.",
        "items": { "type": "array", "items": { "type": "string" } }
    });
    ProviderTool {
        function_declarations: vec![
            ProviderFunctionDeclaration {
                name: TEST_CHECK_TOOL.to_string(),
                description: "Report which prompts and which known agents' latest prompts a \
                    check matches."
                    .to_string(),
                parameters: json!({
                    "type": "object",
                    "properties": { "any_of": check },
                    "required": ["any_of"]
                }),
            },
            ProviderFunctionDeclaration {
                name: SUBMIT_TOOL.to_string(),
                description: "Save new agents and extend known agents' checks. Reports the \
                    items it rejected and why."
                    .to_string(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "new_agents": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "name": { "type": "string" },
                                    "any_of": check
                                },
                                "required": ["name", "any_of"]
                            }
                        },
                        "updates": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "agent_id": { "type": "integer" },
                                    "add_any_of": check
                                },
                                "required": ["agent_id", "add_any_of"]
                            }
                        }
                    }
                }),
            },
        ],
    }
}

#[cfg(test)]
mod tests {
    use sqlx::types::Json;
    use uuid::Uuid;

    use super::*;
    use crate::{
        agent_versioning::{
            definition::{self, Definition},
            detection::agent::LatestPrompt,
        },
        db::agent_versioning::DefinedAgent,
    };

    fn known(name: &str, latest_prompt: &str, time: i64) -> KnownAgent {
        KnownAgent {
            agent: DefinedAgent {
                id: Uuid::new_v4(),
                agent_hash: Uuid::new_v4().simple().to_string(),
                name: Some(name.to_string()),
                definition: Json(Definition::new(vec![vec![name.to_string()]]).unwrap()),
            },
            latest: Some(LatestPrompt {
                system_prompt: latest_prompt.to_string(),
                opening: definition::opening(latest_prompt),
                time,
            }),
        }
    }

    #[test]
    fn only_the_most_recently_seen_agents_prompts_are_shown_past_the_budget() {
        let long = "x".repeat(OPENING_CHARS + 500);
        let agents: Vec<KnownAgent> = (0..12)
            .map(|i| known(&format!("agent {i}"), &long, i))
            .collect();
        let shown = agents_with_prompt_shown(&agents);
        let expected: HashSet<usize> = (2..12).collect();
        assert_eq!(shown, expected);
        let context = context(&[], &agents);
        assert_eq!(context.matches("(not shown").count(), 2);
    }
}
