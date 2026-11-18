//! Eval datasets: Harbor task folders stored in Laminar, each task versioned on
//! its own by the content hash of its folder (LAM-2562). Archives live in S3
//! under the caller's project; Postgres holds which versions exist and which
//! one is each task's latest. See `docs/internal/eval-datasets.md`.

use std::collections::HashSet;

use indexmap::IndexMap;
use uuid::Uuid;

use crate::{
    db::{self, DB, eval_datasets::TaskVersionRow},
    env,
    features::{Feature, is_feature_enabled},
};

const MAX_DATASET_NAME_LEN: usize = 100;
const MAX_TASK_NAME_LEN: usize = 255;
const HASH_HEX_LEN: usize = 64;

/// One version of one task. Every field goes into S3 keys, so construct it
/// only from values that passed [`TaskVersion::validate`].
pub struct TaskVersion<'a> {
    pub dataset: &'a str,
    pub task: &'a str,
    pub hash: &'a str,
}

/// The rejected value of each kind.
#[derive(Debug, PartialEq, Eq)]
pub enum InvalidInput {
    DatasetName(String),
    TaskName(String),
    Hash(String),
}

impl InvalidInput {
    /// The 400 error for the client.
    pub fn message(&self) -> String {
        match self {
            Self::DatasetName(name) => format!(
                "Invalid dataset name {:?}: {}",
                preview(name),
                name_rule(MAX_DATASET_NAME_LEN)
            ),
            Self::TaskName(name) => format!(
                "Invalid task name {:?}: {}",
                preview(name),
                name_rule(MAX_TASK_NAME_LEN)
            ),
            Self::Hash(hash) => format!(
                "Invalid task hash {:?}: expected 64 lowercase hex characters",
                preview(hash)
            ),
        }
    }
}

fn name_rule(max_len: usize) -> String {
    format!(
        "use letters, digits, '.', '_' and '-', start with a letter or digit, \
         at most {max_len} characters"
    )
}

/// Rejected input is echoed back, but only its start: a body can hold megabytes.
fn preview(value: &str) -> String {
    const MAX_CHARS: usize = 300;
    match value.char_indices().nth(MAX_CHARS) {
        Some((cut, _)) => format!("{}…", &value[..cut]),
        None => value.to_string(),
    }
}

impl TaskVersion<'_> {
    pub fn validate(&self) -> Result<(), InvalidInput> {
        if !is_dataset_name(self.dataset) {
            return Err(InvalidInput::DatasetName(self.dataset.to_string()));
        }
        if !is_task_name(self.task) {
            return Err(InvalidInput::TaskName(self.task.to_string()));
        }
        if !is_task_hash(self.hash) {
            return Err(InvalidInput::Hash(self.hash.to_string()));
        }
        Ok(())
    }

    pub fn archive_key(&self, project_id: &Uuid) -> String {
        format!("{}.tar.gz", self.key_prefix(project_id))
    }

    pub fn index_key(&self, project_id: &Uuid) -> String {
        format!("{}.index.json", self.key_prefix(project_id))
    }

    fn key_prefix(&self, project_id: &Uuid) -> String {
        format!(
            "{project_id}/datasets/{}/{}/{}",
            self.dataset, self.task, self.hash
        )
    }
}

/// The bucket task archives live in, when the deployment has S3 storage.
pub fn bucket() -> Option<String> {
    if !is_feature_enabled(Feature::Storage) {
        return None;
    }
    env::optional_string(env::storage::S3_EXPORTS_BUCKET)
}

/// `name` matches `^[A-Za-z0-9][A-Za-z0-9._-]*$` and is at most `max_len` bytes.
fn is_name(name: &str, max_len: usize) -> bool {
    let bytes = name.as_bytes();
    !bytes.is_empty()
        && bytes.len() <= max_len
        && bytes[0].is_ascii_alphanumeric()
        && bytes
            .iter()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b'-'))
}

pub fn is_dataset_name(name: &str) -> bool {
    is_name(name, MAX_DATASET_NAME_LEN)
}

pub fn is_task_name(name: &str) -> bool {
    is_name(name, MAX_TASK_NAME_LEN)
}

/// 64 lowercase hex characters (a bare sha256).
pub fn is_task_hash(hash: &str) -> bool {
    hash.len() == HASH_HEX_LEN && hash.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
}

/// Checks every task name and hash of a `{task: hash}` body.
pub fn validate_task_hashes(tasks: &IndexMap<String, String>) -> Result<(), InvalidInput> {
    if let Some(task) = tasks.keys().find(|task| !is_task_name(task)) {
        return Err(InvalidInput::TaskName(task.clone()));
    }
    if let Some(hash) = tasks.values().find(|hash| !is_task_hash(hash)) {
        return Err(InvalidInput::Hash(hash.clone()));
    }
    Ok(())
}

pub enum PushError {
    /// Tasks whose given hash has no uploaded version, in input order.
    Missing(Vec<String>),
    Internal(anyhow::Error),
}

impl From<sqlx::Error> for PushError {
    fn from(e: sqlx::Error) -> Self {
        Self::Internal(e.into())
    }
}

/// Makes each given (task, hash) the task's latest version by stamping its
/// row with now. All or nothing: any version that was never uploaded rejects
/// the whole push. Names and hashes must already be validated.
pub async fn push_tasks(
    db: &DB,
    project_id: &Uuid,
    dataset: &str,
    tasks: &IndexMap<String, String>,
) -> Result<Vec<TaskVersionRow>, PushError> {
    let mut tx = db.pool.begin().await?;
    let mut pushed =
        db::eval_datasets::touch_task_versions(&mut tx, project_id, dataset, tasks).await?;
    if pushed.len() < tasks.len() {
        tx.rollback().await?;
        return Err(PushError::Missing(unmatched_tasks(tasks, &pushed)));
    }
    tx.commit().await?;
    pushed.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(pushed)
}

fn unmatched_tasks(tasks: &IndexMap<String, String>, matched: &[TaskVersionRow]) -> Vec<String> {
    let matched: HashSet<&str> = matched.iter().map(|row| row.name.as_str()).collect();
    tasks
        .keys()
        .filter(|task| !matched.contains(task.as_str()))
        .cloned()
        .collect()
}

#[cfg(test)]
mod tests {
    use chrono::Utc;

    use super::*;

    fn hash() -> String {
        "9f2c".repeat(16)
    }

    #[test]
    fn names_follow_the_pattern_and_length_caps() {
        for good in ["support", "a", "Task_1.v2-final", "0abc", "a..b"] {
            assert!(is_dataset_name(good), "{good}");
            assert!(is_task_name(good), "{good}");
        }
        for bad in [
            "", ".hidden", "-x", "_x", "a/b", "a b", "..", "a\\b", "é", "a\n", "tâche", "a%2Fb",
        ] {
            assert!(!is_dataset_name(bad), "{bad:?}");
            assert!(!is_task_name(bad), "{bad:?}");
        }
        let at_dataset_cap = "a".repeat(MAX_DATASET_NAME_LEN);
        let past_dataset_cap = "a".repeat(MAX_DATASET_NAME_LEN + 1);
        assert!(is_dataset_name(&at_dataset_cap));
        assert!(!is_dataset_name(&past_dataset_cap));
        assert!(is_task_name(&past_dataset_cap));
        assert!(is_task_name(&"a".repeat(MAX_TASK_NAME_LEN)));
        assert!(!is_task_name(&"a".repeat(MAX_TASK_NAME_LEN + 1)));
    }

    #[test]
    fn hashes_are_bare_lowercase_sha256() {
        let hex = hash();
        assert!(is_task_hash(&hex));
        for bad in [
            format!("sha256:{hex}"),
            hex.to_uppercase(),
            hex[..63].to_string(),
            format!("{hex}0"),
            format!("{}g", &hex[..63]),
            format!("../{}", &hex[..61]),
            String::new(),
        ] {
            assert!(!is_task_hash(&bad), "{bad}");
        }
    }

    #[test]
    fn task_version_validates_each_segment() {
        let hex = hash();
        let version = |dataset, task, hash| TaskVersion {
            dataset,
            task,
            hash,
        };
        assert_eq!(version("support", "refund", &hex).validate(), Ok(()));
        assert_eq!(
            version("a/b", "refund", &hex).validate(),
            Err(InvalidInput::DatasetName("a/b".to_string()))
        );
        assert_eq!(
            version("support", "..", &hex).validate(),
            Err(InvalidInput::TaskName("..".to_string()))
        );
        assert_eq!(
            version("support", "refund", "sha256:00").validate(),
            Err(InvalidInput::Hash("sha256:00".to_string()))
        );
    }

    #[test]
    fn keys_nest_dataset_task_and_hash_under_the_project() {
        let project_id = Uuid::nil();
        let hex = hash();
        let version = TaskVersion {
            dataset: "support",
            task: "refund",
            hash: &hex,
        };
        assert_eq!(
            version.archive_key(&project_id),
            format!("{project_id}/datasets/support/refund/{hex}.tar.gz")
        );
        assert_eq!(
            version.index_key(&project_id),
            format!("{project_id}/datasets/support/refund/{hex}.index.json")
        );
    }

    #[test]
    fn task_hash_bodies_check_names_then_hashes() {
        let mut tasks = IndexMap::new();
        tasks.insert("refund".to_string(), hash());
        assert_eq!(validate_task_hashes(&tasks), Ok(()));
        tasks.insert("bad".to_string(), "sha256:x".to_string());
        assert_eq!(
            validate_task_hashes(&tasks),
            Err(InvalidInput::Hash("sha256:x".to_string()))
        );
        tasks.insert("a/b".to_string(), hash());
        assert_eq!(
            validate_task_hashes(&tasks),
            Err(InvalidInput::TaskName("a/b".to_string()))
        );
    }

    #[test]
    fn unmatched_tasks_keep_input_order() {
        let mut tasks = IndexMap::new();
        for task in ["c", "a", "b"] {
            tasks.insert(task.to_string(), hash());
        }
        let matched = vec![TaskVersionRow {
            name: "a".to_string(),
            hash: hash(),
            created_at: Utc::now(),
        }];
        assert_eq!(unmatched_tasks(&tasks, &matched), ["c", "b"]);
    }
}
