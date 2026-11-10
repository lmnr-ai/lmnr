//! An agent's definition: the deterministic check that tells its spans apart
//! at ingest. Detection ([`super::detection`]) writes definitions; ingest
//! matches every LLM span's system prompt against them ([`super::identity`]).

use serde::{Deserialize, Serialize};

use crate::utils::sanitize_string;

/// Only the prompt's opening is matched: deeper text is often shared, e.g. a
/// subagent prompt that embeds its parent's instructions. It is long enough to
/// reach past what prompts often open with (memory, skill lists, a
/// framework's preset) to the agent's own instructions.
pub const OPENING_CHARS: usize = 10_000;

/// A system prompt's first [`OPENING_CHARS`] characters, normalized like
/// definitions. Built once per prompt, then matched against every definition.
pub struct Opening(String);

impl Opening {
    pub fn new(system_prompt: &str) -> Self {
        let opening: String = system_prompt.chars().take(OPENING_CHARS).collect();
        Self(normalize(&opening))
    }
}

/// Matches a system prompt when every substring of any one alternative occurs
/// in its [`Opening`], ignoring case and whitespace. Substrings are normalized
/// on construction and again when read back, so a definition written to
/// Postgres by hand still matches.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(from = "StoredDefinition")]
pub struct Definition {
    pub any_of: Vec<Vec<String>>,
}

#[derive(Deserialize)]
struct StoredDefinition {
    any_of: Vec<Vec<String>>,
}

impl From<StoredDefinition> for Definition {
    /// A stored definition left without any substring matches nothing.
    fn from(stored: StoredDefinition) -> Self {
        Self {
            any_of: normalized(stored.any_of),
        }
    }
}

impl Definition {
    /// Normalizes the substrings and drops empty ones; `None` when no
    /// alternative is left.
    pub fn new(any_of: Vec<Vec<String>>) -> Option<Self> {
        let any_of = normalized(any_of);
        (!any_of.is_empty()).then_some(Self { any_of })
    }

    pub fn matches(&self, opening: &Opening) -> bool {
        self.any_of.iter().any(|all_of| {
            all_of
                .iter()
                .all(|substring| opening.0.contains(substring.as_str()))
        })
    }

    /// This definition with `other`'s alternatives added, so everything it
    /// matched still matches.
    pub fn extended(&self, other: &Definition) -> Definition {
        let mut any_of = self.any_of.clone();
        for all_of in &other.any_of {
            if !any_of.contains(all_of) {
                any_of.push(all_of.clone());
            }
        }
        Definition { any_of }
    }
}

fn normalized(any_of: Vec<Vec<String>>) -> Vec<Vec<String>> {
    any_of
        .iter()
        .map(|all_of| {
            all_of
                .iter()
                .map(|substring| normalize(substring))
                .filter(|substring| !substring.is_empty())
                .collect::<Vec<_>>()
        })
        .filter(|all_of| !all_of.is_empty())
        .collect()
}

/// Control characters go too: Postgres rejects NUL inside `jsonb`.
pub(super) fn normalize(text: &str) -> String {
    sanitize_string(text)
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn definition(any_of: &[&[&str]]) -> Definition {
        Definition::new(
            any_of
                .iter()
                .map(|all_of| all_of.iter().map(|s| s.to_string()).collect())
                .collect(),
        )
        .unwrap()
    }

    fn matches(check: &Definition, prompt: &str) -> bool {
        check.matches(&Opening::new(prompt))
    }

    #[test]
    fn matches_after_a_dynamic_preamble() {
        let check = definition(&[&["You are a GTM assistant"]]);
        let prompt = "Today is 2026-11-06. User: Jane Doe (Acme), 42 credits left.\n\
                      You are a GTM   assistant that drafts outreach.";
        assert!(matches(&check, prompt));
    }

    #[test]
    fn needs_every_substring_of_one_alternative() {
        let check = definition(&[&["gtm assistant", "outreach"], &["sales copilot"]]);
        assert!(matches(&check, "You are a GTM assistant. Draft outreach."));
        assert!(matches(&check, "You are the Sales Copilot."));
        assert!(!matches(&check, "You are a GTM assistant."));
    }

    #[test]
    fn matches_past_a_long_preamble() {
        let check = definition(&[&["you are a gtm assistant"]]);
        let skills = "- web_search: look things up online\n".repeat(150);
        assert!(matches(
            &check,
            &format!("{skills}You are a GTM assistant.")
        ));
    }

    #[test]
    fn ignores_text_past_the_opening() {
        let check = definition(&[&["you are a gtm assistant"]]);
        let prompt = format!("{}You are a GTM assistant.", "x".repeat(OPENING_CHARS));
        assert!(!matches(&check, &prompt));
    }

    #[test]
    fn a_hand_written_definition_is_normalized_when_read() {
        let stored = r#"{"any_of": [["You are a  GTM\nAssistant"]]}"#;
        let check: Definition = serde_json::from_str(stored).unwrap();
        assert_eq!(
            check.any_of,
            vec![vec!["you are a gtm assistant".to_string()]]
        );
        assert!(matches(&check, "Today is Monday. You are a GTM assistant."));
        let empty: Definition = serde_json::from_str(r#"{"any_of": [[" "]]}"#).unwrap();
        assert!(!matches(&empty, "anything"));
    }

    #[test]
    fn empty_substrings_and_alternatives_are_dropped() {
        assert_eq!(Definition::new(vec![vec![" ".to_string()], vec![]]), None);
        let check = Definition::new(vec![vec!["  A\n b ".to_string(), String::new()]]).unwrap();
        assert_eq!(check.any_of, vec![vec!["a b".to_string()]]);
    }

    #[test]
    fn extending_keeps_old_alternatives_and_skips_duplicates() {
        let old = definition(&[&["research analyst"]]);
        let extended = old.extended(&definition(&[&["research analyst"], &["market analyst"]]));
        assert_eq!(
            extended,
            definition(&[&["research analyst"], &["market analyst"]])
        );
        assert!(matches(&extended, "You are a Research Analyst."));
    }
}
