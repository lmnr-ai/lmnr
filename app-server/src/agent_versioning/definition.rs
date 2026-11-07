//! An agent's definition: the deterministic check that tells its spans apart
//! at ingest. Detection ([`super::detection`]) writes definitions; ingest
//! matches every LLM span's system prompt against them ([`super::identity`]).

use serde::{Deserialize, Serialize};

use crate::utils::{sanitize_string, truncate_chars};

/// Only the prompt's opening is matched: deeper text is often shared, e.g. a
/// subagent prompt that embeds its parent's instructions.
pub const OPENING_CHARS: usize = 1000;

/// Matches a system prompt when every substring of any one alternative occurs
/// in its first [`OPENING_CHARS`] characters, ignoring case and whitespace.
/// Substrings are stored normalized.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Definition {
    pub any_of: Vec<Vec<String>>,
}

impl Definition {
    /// Normalizes the substrings and drops empty ones; `None` when no
    /// alternative is left.
    pub fn new(any_of: Vec<Vec<String>>) -> Option<Self> {
        let any_of: Vec<Vec<String>> = any_of
            .iter()
            .map(|all_of| {
                all_of
                    .iter()
                    .map(|substring| normalize(substring))
                    .filter(|substring| !substring.is_empty())
                    .collect::<Vec<_>>()
            })
            .filter(|all_of| !all_of.is_empty())
            .collect();
        (!any_of.is_empty()).then_some(Self { any_of })
    }

    pub fn matches(&self, system_prompt: &str) -> bool {
        let opening = normalize(&truncate_chars(system_prompt, OPENING_CHARS));
        self.any_of.iter().any(|all_of| {
            all_of
                .iter()
                .all(|substring| opening.contains(substring.as_str()))
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

/// Control characters go too: Postgres rejects NUL inside `jsonb`.
fn normalize(text: &str) -> String {
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

    #[test]
    fn matches_after_a_dynamic_preamble() {
        let check = definition(&[&["You are a GTM assistant"]]);
        let prompt = "Today is 2026-11-06. User: Jane Doe (Acme), 42 credits left.\n\
                      You are a GTM   assistant that drafts outreach.";
        assert!(check.matches(prompt));
    }

    #[test]
    fn needs_every_substring_of_one_alternative() {
        let check = definition(&[&["gtm assistant", "outreach"], &["sales copilot"]]);
        assert!(check.matches("You are a GTM assistant. Draft outreach."));
        assert!(check.matches("You are the Sales Copilot."));
        assert!(!check.matches("You are a GTM assistant."));
    }

    #[test]
    fn ignores_text_past_the_opening() {
        let check = definition(&[&["you are a gtm assistant"]]);
        let prompt = format!("{}You are a GTM assistant.", "x".repeat(OPENING_CHARS));
        assert!(!check.matches(&prompt));
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
        assert!(extended.matches("You are a Research Analyst."));
    }
}
