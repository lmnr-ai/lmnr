//! Eval datasets: Harbor task folders stored in Laminar as immutable, numbered
//! versions (LAM-2555). Task archives are content-addressed per project in S3;
//! Postgres holds datasets, versions and which task hash each version pins.
//! See `docs/internal/eval-datasets.md`.

use std::collections::{BTreeMap, BTreeSet};

use uuid::Uuid;

use crate::{
    db::{self, DB, eval_datasets::NewVersion},
    env,
    features::{Feature, is_feature_enabled},
};

pub const MAX_DATASET_NAME_LEN: usize = 100;
pub const MAX_TASK_NAME_LEN: usize = 255;
/// Concurrent pushes serialize on the dataset row, so a taken version number
/// is rare; this only bounds the retry.
const MAX_VERSION_ATTEMPTS: usize = 3;
const PG_UNIQUE_VIOLATION: &str = "23505";

/// A version to create: task name → task hash. Names and hashes must already
/// be validated.
pub struct VersionRequest<'a> {
    pub dataset: &'a str,
    pub parent_version: Option<i32>,
    pub message: Option<&'a str>,
    pub tasks: &'a BTreeMap<String, String>,
    pub created_by_user_id: Option<Uuid>,
}

pub struct CreatedVersion {
    pub dataset_id: Uuid,
    pub version: i32,
    /// The dataset's latest version before this one.
    pub previous_latest: Option<i32>,
}

pub enum CreateVersionError {
    /// Hashes with no uploaded task in the project.
    MissingTasks(Vec<String>),
    UnknownParent(i32),
    Internal(anyhow::Error),
}

impl From<anyhow::Error> for CreateVersionError {
    fn from(e: anyhow::Error) -> Self {
        Self::Internal(e)
    }
}

impl From<sqlx::Error> for CreateVersionError {
    fn from(e: sqlx::Error) -> Self {
        Self::Internal(e.into())
    }
}

/// Which version of a dataset a read asks for.
#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub enum VersionSelector {
    Latest,
    Number(i32),
}

impl VersionSelector {
    pub fn parse(value: &str) -> Option<Self> {
        if value == "latest" {
            return Some(Self::Latest);
        }
        if value.is_empty() || !value.bytes().all(|b| b.is_ascii_digit()) {
            return None;
        }
        value.parse().ok().filter(|n| *n >= 1).map(Self::Number)
    }

    pub fn number(self) -> Option<i32> {
        match self {
            Self::Latest => None,
            Self::Number(n) => Some(n),
        }
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

/// `sha256:` + 64 lowercase hex. The hash goes into S3 keys, so nothing else passes.
pub fn is_task_hash(hash: &str) -> bool {
    hash.strip_prefix("sha256:").is_some_and(|hex| {
        hex.len() == 64 && hex.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
    })
}

/// Callers check [`is_task_hash`] first.
fn hash_hex(hash: &str) -> &str {
    hash.strip_prefix("sha256:").unwrap_or(hash)
}

pub fn archive_key(project_id: &Uuid, hash: &str) -> String {
    format!("eval-datasets/{project_id}/tasks/{}.tar.gz", hash_hex(hash))
}

pub fn index_key(project_id: &Uuid, hash: &str) -> String {
    format!(
        "eval-datasets/{project_id}/tasks/{}.index.json",
        hash_hex(hash)
    )
}

/// Creates the next version of `request.dataset` (and the dataset itself on
/// its first push). Every task must already be uploaded to the project.
pub async fn create_version(
    db: &DB,
    project_id: &Uuid,
    request: &VersionRequest<'_>,
) -> Result<CreatedVersion, CreateVersionError> {
    let unique_hashes: Vec<String> = request
        .tasks
        .values()
        .cloned()
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect();
    let missing = db::eval_datasets::missing_blobs(&db.pool, project_id, &unique_hashes).await?;
    if !missing.is_empty() {
        return Err(CreateVersionError::MissingTasks(missing));
    }

    let names: Vec<String> = request.tasks.keys().cloned().collect();
    let hashes: Vec<String> = request.tasks.values().cloned().collect();
    let mut attempt = 1;
    loop {
        match insert_next_version(db, project_id, request, &names, &hashes).await {
            Err(CreateVersionError::Internal(e))
                if attempt < MAX_VERSION_ATTEMPTS && is_unique_violation(&e) =>
            {
                attempt += 1;
            }
            result => return result,
        }
    }
}

async fn insert_next_version(
    db: &DB,
    project_id: &Uuid,
    request: &VersionRequest<'_>,
    names: &[String],
    hashes: &[String],
) -> Result<CreatedVersion, CreateVersionError> {
    let mut tx = db.pool.begin().await?;
    let dataset_id =
        db::eval_datasets::lock_or_create_dataset(&mut tx, project_id, request.dataset).await?;
    if let Some(parent) = request.parent_version
        && !db::eval_datasets::version_exists(&mut tx, &dataset_id, parent).await?
    {
        return Err(CreateVersionError::UnknownParent(parent));
    }
    let previous_latest = db::eval_datasets::latest_version(&mut tx, &dataset_id).await?;
    let version = next_version(previous_latest);
    db::eval_datasets::insert_version(
        &mut tx,
        &NewVersion {
            dataset_id,
            version,
            parent_version: request.parent_version,
            message: request.message,
            created_by_user_id: request.created_by_user_id,
        },
        names,
        hashes,
    )
    .await?;
    tx.commit().await?;
    Ok(CreatedVersion {
        dataset_id,
        version,
        previous_latest,
    })
}

fn next_version(latest: Option<i32>) -> i32 {
    latest.map_or(1, |v| v + 1)
}

fn is_unique_violation(error: &anyhow::Error) -> bool {
    error
        .downcast_ref::<sqlx::Error>()
        .and_then(|e| e.as_database_error())
        .and_then(|e| e.code())
        .is_some_and(|code| code == PG_UNIQUE_VIOLATION)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_follow_the_pattern_and_length_caps() {
        for good in ["support", "a", "Task_1.v2-final", "0abc", "a..b"] {
            assert!(is_dataset_name(good), "{good}");
            assert!(is_task_name(good), "{good}");
        }
        for bad in [
            "", ".hidden", "-x", "_x", "a/b", "a b", "..", "a\\b", "é", "a\n", "tâche",
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
    fn hashes_are_lowercase_sha256() {
        let hex = "9f2c".repeat(16);
        assert!(is_task_hash(&format!("sha256:{hex}")));
        for bad in [
            hex.clone(),
            format!("sha256:{}", hex.to_uppercase()),
            format!("sha256:{}", &hex[..63]),
            format!("sha256:{hex}0"),
            format!("sha512:{hex}"),
            format!("sha256:{}g", &hex[..63]),
            format!("sha256:../{}", &hex[..61]),
        ] {
            assert!(!is_task_hash(&bad), "{bad}");
        }
    }

    #[test]
    fn keys_use_the_bare_hex() {
        let project_id = Uuid::nil();
        let hash = format!("sha256:{}", "ab".repeat(32));
        assert_eq!(
            archive_key(&project_id, &hash),
            format!(
                "eval-datasets/{project_id}/tasks/{}.tar.gz",
                "ab".repeat(32)
            )
        );
        assert_eq!(
            index_key(&project_id, &hash),
            format!(
                "eval-datasets/{project_id}/tasks/{}.index.json",
                "ab".repeat(32)
            )
        );
    }

    #[test]
    fn version_selector_parses_latest_and_positive_numbers() {
        assert_eq!(
            VersionSelector::parse("latest"),
            Some(VersionSelector::Latest)
        );
        assert_eq!(
            VersionSelector::parse("7"),
            Some(VersionSelector::Number(7))
        );
        for bad in ["", "0", "-1", "+1", "1.0", "Latest", "99999999999", " 1"] {
            assert_eq!(VersionSelector::parse(bad), None, "{bad:?}");
        }
    }

    #[test]
    fn versions_count_from_one() {
        assert_eq!(next_version(None), 1);
        assert_eq!(next_version(Some(1)), 2);
        assert_eq!(next_version(Some(41)), 42);
    }
}
