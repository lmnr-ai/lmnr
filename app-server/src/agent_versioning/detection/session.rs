//! The detection LLM's tools, without the LLM: test a check against the
//! samples and the known agents, and validate a submission. Everything the
//! model proposes is checked here before it is saved.

use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

use crate::{
    agent_versioning::definition::{Definition, OPENING_CHARS, Opening},
    db::agent_versioning::DefinedAgent,
    utils::truncate_chars,
};

/// A prompt's opening: raw as shown to the model, normalized as matched.
pub struct Sample {
    pub text: String,
    pub opening: Opening,
}

impl Sample {
    pub fn of(system_prompt: &str) -> Self {
        Self {
            text: truncate_chars(system_prompt, OPENING_CHARS),
            opening: Opening::of(system_prompt),
        }
    }
}

/// A defined agent with its latest prompt, when one was ingested recently.
pub struct KnownAgent {
    pub agent: DefinedAgent,
    pub example: Option<Sample>,
}

/// A saved change. `Extend` carries the full new definition.
#[derive(Debug, PartialEq)]
pub enum Change {
    Create {
        name: String,
        definition: Definition,
    },
    Extend {
        agent_id: Uuid,
        definition: Definition,
    },
}

#[derive(Debug, Deserialize)]
pub struct CheckInput {
    any_of: Vec<Vec<String>>,
}

#[derive(Debug, Deserialize)]
pub struct Submission {
    #[serde(default)]
    new_agents: Vec<NewAgent>,
    #[serde(default)]
    updates: Vec<Update>,
}

#[derive(Debug, Deserialize)]
struct NewAgent {
    name: String,
    any_of: Vec<Vec<String>>,
}

#[derive(Debug, Deserialize)]
struct Update {
    /// 1-based position in the prompt's agent list.
    agent_id: usize,
    add_any_of: Vec<Vec<String>>,
}

/// Samples and agents are numbered from 1 in the prompt and in tool results.
pub struct Session {
    pub samples: Vec<Sample>,
    pub agents: Vec<KnownAgent>,
    pub min_matches: usize,
    pub changes: Vec<Change>,
}

impl Session {
    pub fn new(samples: Vec<Sample>, agents: Vec<KnownAgent>, min_matches: usize) -> Self {
        Self {
            samples,
            agents,
            min_matches,
            changes: Vec::new(),
        }
    }

    /// Which samples and agents' latest prompts `input` matches.
    pub fn test_check(&self, input: CheckInput) -> Value {
        let Some(definition) = Definition::new(input.any_of) else {
            return json!({ "error": "The check has no non-empty substring." });
        };
        json!({
            "matched_samples": self.matched_samples(&definition),
            "matched_agents": self.matched_agents(&definition, None),
        })
    }

    /// Accepts every valid item of `submission` into `changes` and reports
    /// the rejected ones, which the model may fix and submit again.
    pub fn submit(&mut self, submission: Submission) -> Value {
        let mut accepted = 0;
        let mut rejected = Vec::new();
        for new_agent in submission.new_agents {
            match self.validate_new(&new_agent) {
                Ok(change) => {
                    self.changes.push(change);
                    accepted += 1;
                }
                Err(reason) => {
                    rejected.push(json!({ "new_agent": new_agent.name, "reason": reason }))
                }
            }
        }
        for update in submission.updates {
            match self.validate_update(&update) {
                Ok(change) => {
                    self.changes.push(change);
                    accepted += 1;
                }
                Err(reason) => {
                    rejected.push(json!({ "agent_id": update.agent_id, "reason": reason }))
                }
            }
        }
        json!({ "accepted": accepted, "rejected": rejected })
    }

    fn validate_new(&self, new_agent: &NewAgent) -> Result<Change, String> {
        let name = new_agent.name.trim();
        if name.is_empty() {
            return Err("The name is empty.".to_string());
        }
        let definition = Definition::new(new_agent.any_of.clone())
            .ok_or("The check has no non-empty substring.")?;
        self.validate_check(&definition, None)?;
        if self.is_created(&definition) {
            return Err("An agent with this check was already accepted.".to_string());
        }
        Ok(Change::Create {
            name: name.to_string(),
            definition,
        })
    }

    fn validate_update(&self, update: &Update) -> Result<Change, String> {
        let known = update
            .agent_id
            .checked_sub(1)
            .and_then(|index| self.agents.get(index))
            .ok_or("No agent has this id.")?;
        let added = Definition::new(update.add_any_of.clone())
            .ok_or("The added check has no non-empty substring.")?;
        self.validate_check(&added, Some(update.agent_id))?;
        Ok(Change::Extend {
            agent_id: known.agent.id,
            definition: self.current_definition(known).extended(&added),
        })
    }

    /// A check must cover enough samples to be a recurring agent, and must
    /// not claim another agent's prompts.
    fn validate_check(
        &self,
        definition: &Definition,
        own_agent: Option<usize>,
    ) -> Result<(), String> {
        let matched = self.matched_samples(definition).len();
        if matched < self.min_matches {
            return Err(format!(
                "Matches {matched} samples; at least {} are needed.",
                self.min_matches
            ));
        }
        let others = self.matched_agents(definition, own_agent);
        if !others.is_empty() {
            return Err(format!(
                "Also matches the latest prompt of agents {others:?}."
            ));
        }
        Ok(())
    }

    fn matched_samples(&self, definition: &Definition) -> Vec<usize> {
        numbered(&self.samples)
            .filter(|(_, sample)| definition.matches(&sample.opening))
            .map(|(id, _)| id)
            .collect()
    }

    fn matched_agents(&self, definition: &Definition, except: Option<usize>) -> Vec<usize> {
        numbered(&self.agents)
            .filter(|(id, _)| Some(*id) != except)
            .filter(|(_, known)| {
                known
                    .example
                    .as_ref()
                    .is_some_and(|example| definition.matches(&example.opening))
            })
            .map(|(id, _)| id)
            .collect()
    }

    fn is_created(&self, definition: &Definition) -> bool {
        self.changes.iter().any(|change| {
            matches!(change, Change::Create { definition: created, .. } if created == definition)
        })
    }

    /// The agent's definition with this session's accepted extensions.
    fn current_definition(&self, known: &KnownAgent) -> Definition {
        self.changes
            .iter()
            .rev()
            .find_map(|change| match change {
                Change::Extend {
                    agent_id,
                    definition,
                } if *agent_id == known.agent.id => Some(definition.clone()),
                _ => None,
            })
            .unwrap_or_else(|| known.agent.definition.0.clone())
    }
}

fn numbered<T>(items: &[T]) -> impl Iterator<Item = (usize, &T)> {
    items
        .iter()
        .enumerate()
        .map(|(index, item)| (index + 1, item))
}

#[cfg(test)]
mod tests {
    use sqlx::types::Json;

    use super::*;

    fn sample(text: &str) -> Sample {
        Sample::of(text)
    }

    fn check(any_of: &[&[&str]]) -> Vec<Vec<String>> {
        any_of
            .iter()
            .map(|all_of| all_of.iter().map(|s| s.to_string()).collect())
            .collect()
    }

    fn known(name: &str, any_of: &[&[&str]], example: &str) -> KnownAgent {
        KnownAgent {
            agent: DefinedAgent {
                id: Uuid::new_v4(),
                agent_hash: Uuid::new_v4().simple().to_string(),
                name: Some(name.to_string()),
                definition: Json(Definition::new(check(any_of)).unwrap()),
            },
            example: Some(sample(example)),
        }
    }

    fn gtm_samples(count: usize) -> Vec<Sample> {
        (0..count)
            .map(|i| {
                sample(&format!(
                    "Today is day {i}. User #{i}.\nYou are a GTM assistant."
                ))
            })
            .collect()
    }

    fn new_agent(name: &str, any_of: &[&[&str]]) -> Submission {
        serde_json::from_value(json!({ "new_agents": [{ "name": name, "any_of": check(any_of) }] }))
            .unwrap()
    }

    #[test]
    fn test_check_reports_matching_samples_and_agents() {
        let samples = vec![
            sample("You are a GTM assistant."),
            sample("You are a coder."),
        ];
        let agents = vec![known("Coder", &[&["you are a coder"]], "You are a coder.")];
        let session = Session::new(samples, agents, 1);
        let result = session.test_check(CheckInput {
            any_of: check(&[&["you are a"]]),
        });
        assert_eq!(result["matched_samples"], json!([1, 2]));
        assert_eq!(result["matched_agents"], json!([1]));
    }

    #[test]
    fn new_agent_is_accepted_when_it_matches_enough_samples() {
        let mut session = Session::new(gtm_samples(3), Vec::new(), 3);
        let result = session.submit(new_agent(
            " GTM Assistant ",
            &[&["You are a GTM assistant"]],
        ));
        assert_eq!(result["accepted"], json!(1));
        assert_eq!(
            session.changes,
            vec![Change::Create {
                name: "GTM Assistant".to_string(),
                definition: Definition::new(check(&[&["you are a gtm assistant"]])).unwrap(),
            }]
        );
    }

    #[test]
    fn one_off_prompts_do_not_become_agents() {
        let mut samples = gtm_samples(5);
        samples.push(sample("You are a one-off subagent."));
        let mut session = Session::new(samples, Vec::new(), 3);
        let result = session.submit(new_agent("Subagent", &[&["one-off subagent"]]));
        assert_eq!(result["accepted"], json!(0));
        assert!(session.changes.is_empty());
    }

    #[test]
    fn a_check_claiming_a_known_agent_is_rejected() {
        let agents = vec![known(
            "GTM",
            &[&["gtm assistant v1"]],
            "You are a GTM assistant v1.",
        )];
        let mut session = Session::new(gtm_samples(3), agents, 3);
        let result = session.submit(new_agent("GTM 2", &[&["gtm assistant"]]));
        assert_eq!(result["accepted"], json!(0));
        assert_eq!(result["rejected"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn a_duplicate_new_agent_is_rejected() {
        let mut session = Session::new(gtm_samples(3), Vec::new(), 3);
        session.submit(new_agent("GTM", &[&["gtm assistant"]]));
        let result = session.submit(new_agent("GTM again", &[&["gtm assistant"]]));
        assert_eq!(result["accepted"], json!(0));
        assert_eq!(session.changes.len(), 1);
    }

    #[test]
    fn update_adds_an_alternative_and_keeps_the_old_one() {
        let agents = vec![known(
            "GTM",
            &[&["you are a sales bot"]],
            "You are a sales bot.",
        )];
        let agent_id = agents[0].agent.id;
        let mut session = Session::new(gtm_samples(3), agents, 3);
        let submission = serde_json::from_value(json!({
            "updates": [{ "agent_id": 1, "add_any_of": [["gtm assistant"]] }]
        }))
        .unwrap();
        let result = session.submit(submission);
        assert_eq!(result["accepted"], json!(1));
        assert_eq!(
            session.changes,
            vec![Change::Extend {
                agent_id,
                definition: Definition::new(check(&[&["you are a sales bot"], &["gtm assistant"]]))
                    .unwrap(),
            }]
        );
    }

    #[test]
    fn update_of_an_unknown_agent_is_rejected() {
        let mut session = Session::new(gtm_samples(3), Vec::new(), 3);
        let submission = serde_json::from_value(json!({
            "updates": [{ "agent_id": 1, "add_any_of": [["gtm assistant"]] }]
        }))
        .unwrap();
        assert_eq!(session.submit(submission)["accepted"], json!(0));
    }
}
