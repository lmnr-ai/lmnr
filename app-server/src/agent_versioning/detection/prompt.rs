//! What the detection model reads: its instructions, the prompts and agents it
//! works on, and its tools' schemas.

use std::collections::HashMap;

use serde_json::json;

use super::agent::{KnownAgent, UnlabelledPrompt};
use crate::{
    agent_versioning::definition::{OPENING_CHARS, normalize},
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
tools, a framework's preset. Look past it for the agent's own instructions. Lines already \
shown earlier in the message are elided as `[… N lines as in prompt 3 …]` (or `agent 2`): \
the prompt holds those lines at that point, so checks can use them and `test_check` sees \
them.

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

/// The first user message. Prompts and agents are numbered from 1, the ids the
/// tools take and report. Lines shown once are elided after, so the many
/// prompts of one agent, or a preset shared by several, cost little.
pub fn context(prompts: &[UnlabelledPrompt], agents: &[KnownAgent]) -> String {
    let mut shown = Shown::default();
    let agents: String = agents
        .iter()
        .enumerate()
        .map(|(index, known)| {
            let check = serde_json::to_string(&known.agent.definition.any_of).unwrap_or_default();
            let latest_prompt = match &known.latest {
                Some(latest) => format!(
                    "<latest_prompt time=\"{}\">\n{}\n</latest_prompt>",
                    format_time(latest.time),
                    shown.render(
                        &format!("agent {}", index + 1),
                        &truncate_chars(&latest.system_prompt, OPENING_CHARS)
                    )
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
                shown.render(
                    &format!("prompt {}", index + 1),
                    &truncate_chars(&prompt.system_prompt, OPENING_CHARS)
                )
            )
        })
        .collect();
    format!("<agents>\n{agents}</agents>\n\n<prompts>\n{prompts}</prompts>")
}

/// Shorter runs of shown lines are repeated: a marker would save little.
const MIN_ELIDED_CHARS: usize = 200;

/// Lines already in the context, normalized like checks, each with the label
/// of the opening that first showed it.
#[derive(Default)]
struct Shown {
    lines: HashMap<String, String>,
}

/// Consecutive lines that were all shown before.
#[derive(Default)]
struct ShownRun<'a> {
    lines: Vec<&'a str>,
    non_blank: usize,
    chars: usize,
    /// Where the run's first line was shown.
    source: Option<String>,
}

impl Shown {
    /// The opening with each long enough run of shown lines replaced by a
    /// marker naming where it was shown.
    fn render(&mut self, label: &str, opening: &str) -> String {
        let mut out = Vec::new();
        let mut run = ShownRun::default();
        for line in opening.split('\n') {
            let key = normalize(line);
            if key.is_empty() {
                // A blank line neither starts nor breaks a run.
                if run.lines.is_empty() {
                    out.push(line.to_string());
                } else {
                    run.lines.push(line);
                }
                continue;
            }
            match self.lines.get(&key) {
                Some(source) => {
                    run.source.get_or_insert_with(|| source.clone());
                    run.lines.push(line);
                    run.non_blank += 1;
                    run.chars += line.len();
                }
                None => {
                    std::mem::take(&mut run).flush(&mut out);
                    out.push(line.to_string());
                    self.lines.insert(key, label.to_string());
                }
            }
        }
        run.flush(&mut out);
        out.join("\n")
    }
}

impl ShownRun<'_> {
    fn flush(self, out: &mut Vec<String>) {
        match &self.source {
            Some(source) if self.chars >= MIN_ELIDED_CHARS => {
                out.push(format!("[… {} lines as in {source} …]", self.non_blank));
            }
            _ => out.extend(self.lines.into_iter().map(str::to_string)),
        }
    }
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
    use uuid::Uuid;

    use super::*;
    use crate::agent_versioning::definition::Opening;

    fn unlabelled(system_prompt: &str) -> UnlabelledPrompt {
        UnlabelledPrompt {
            trace_id: Uuid::new_v4(),
            span_id: Uuid::new_v4(),
            system_prompt: system_prompt.to_string(),
            opening: Opening::new(system_prompt),
            time: 0,
        }
    }

    fn preset() -> String {
        (0..40)
            .map(|i| format!("- skill_{i}: a tool the framework gives every agent it runs.\n"))
            .collect()
    }

    #[test]
    fn a_long_run_shown_before_becomes_a_marker() {
        let mut shown = Shown::default();
        let first = format!("{}You are a GTM assistant.", preset());
        assert_eq!(shown.render("prompt 1", &first), first);
        let second = format!("Today is Monday.\n{}You are a GTM assistant.", preset());
        assert_eq!(
            shown.render("prompt 2", &second),
            "Today is Monday.\n[… 41 lines as in prompt 1 …]"
        );
    }

    #[test]
    fn new_lines_split_runs_and_short_runs_are_repeated() {
        let mut shown = Shown::default();
        shown.render("agent 1", &format!("{}Rules:\nBe brief.", preset()));
        let rendered = shown.render(
            "prompt 1",
            &format!("{}You are a research analyst.\nRules:\nBe brief.", preset()),
        );
        assert_eq!(
            rendered,
            "[… 40 lines as in agent 1 …]\nYou are a research analyst.\nRules:\nBe brief."
        );
    }

    #[test]
    fn many_prompts_of_few_agents_stay_small() {
        let roles = ["a GTM assistant", "a coding agent", "a support bot"];
        let prompts: Vec<UnlabelledPrompt> = (0..20)
            .map(|i| {
                unlabelled(&format!(
                    "Memory: user {i} prefers short answers.\n{}You are {}.",
                    preset(),
                    roles[i % roles.len()]
                ))
            })
            .collect();
        let naive: usize = prompts.iter().map(|p| p.system_prompt.len()).sum();
        let context = context(&prompts, &[]);
        assert!(context.len() * 5 < naive, "{} of {naive}", context.len());
        for role in roles {
            assert!(context.contains(role));
        }
    }
}
