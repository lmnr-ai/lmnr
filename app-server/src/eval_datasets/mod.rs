//! Eval datasets (LAM-2562): versioned Harbor task folders that `lmnr-cli eval
//! dataset pull / push` syncs. A version is a content hash the CLI computes; its
//! archive and file index live in S3, the dataset/task/version rows in Postgres.
//! See `docs/internal/eval-datasets.md`.

use std::collections::HashMap;

use anyhow::Result;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::db::{
    self, DB,
    eval_datasets::{TaskHash, TaskVersion},
};

pub const MAX_DATASET_NAME_BYTES: usize = 255;
pub const MAX_TASK_NAME_BYTES: usize = 255;

/// One version of a dataset's task. The routes take each name as two path
/// segments (`{org}/{name}`) and join them into these full names.
#[derive(Debug)]
pub struct VersionRef {
    pub dataset: String,
    pub task: String,
    pub hash: String,
}

/// One entry of a push: make `hash` the task's pin, provided it hasn't moved
/// since `base` (the hash the pusher last pulled, `None` for a new task).
#[derive(Deserialize, Debug)]
pub struct PushEntry {
    pub task: String,
    pub hash: String,
    #[serde(default)]
    pub base: Option<String>,
}

/// A task whose pin moved; `latest` is its newest version other than the pushed one.
#[derive(Serialize, Debug, PartialEq, Eq)]
pub struct MovedTask {
    pub task: String,
    pub latest: String,
}

pub enum PushOutcome {
    /// The pushed versions, by task id bytewise.
    Pushed(Vec<TaskVersion>),
    Rejected(PushRejection),
}

pub enum PushRejection {
    VersionsMissing(Vec<TaskHash>),
    Moved(Vec<MovedTask>),
}

/// Harbor's `org/name` (`[dataset] name` in `dataset.toml`): two parts of
/// `^[A-Za-z0-9][A-Za-z0-9._-]*$` joined by one `/`, no `..` anywhere, at most
/// 255 bytes. Names go into S3 keys as exactly two segments, neither a dot segment.
pub fn is_dataset_name(name: &str) -> bool {
    is_name(name, MAX_DATASET_NAME_BYTES)
}

/// Same rule as [`is_dataset_name`] (`[task] name` in `task.toml`).
pub fn is_task_name(name: &str) -> bool {
    is_name(name, MAX_TASK_NAME_BYTES)
}

fn is_name(name: &str, max_bytes: usize) -> bool {
    name.len() <= max_bytes
        && !name.contains("..")
        && name
            .split_once('/')
            .is_some_and(|(org, rest)| is_name_part(org) && is_name_part(rest))
}

fn is_name_part(part: &str) -> bool {
    match part.as_bytes() {
        [] => false,
        [first, rest @ ..] => {
            first.is_ascii_alphanumeric()
                && rest
                    .iter()
                    .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b'-'))
        }
    }
}

/// A task version hash: 64 lowercase hex characters (sha256).
pub fn is_version_hash(hash: &str) -> bool {
    hash.len() == 64 && hash.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
}

/// The version's archive (lmnr-cli `pack.ts` output). Never expires, unlike `hosted-evals/`.
pub fn archive_key(project_id: &Uuid, version: &VersionRef) -> String {
    format!("{}.tar.gz", key_prefix(project_id, version))
}

/// The archive's file index (`hosted_evals::ArchiveIndex`), read by the frontend's file view.
pub fn index_key(project_id: &Uuid, version: &VersionRef) -> String {
    format!("{}.index.json", key_prefix(project_id, version))
}

/// `<project_id>/datasets/<org>/<name>/<task org>/<task name>/<hash>`. A valid name
/// is exactly two segments, neither empty nor a dot segment, so the layout is fixed
/// and distinct versions never share a key.
fn key_prefix(project_id: &Uuid, version: &VersionRef) -> String {
    format!(
        "{project_id}/datasets/{}/{}/{}",
        version.dataset, version.task, version.hash
    )
}

/// The latest of a task's versions: greatest `created_at`, then greatest hash.
pub fn latest<'a>(versions: &[&'a TaskVersion]) -> Option<&'a TaskVersion> {
    versions
        .iter()
        .copied()
        .max_by(|a, b| (a.created_at, &a.hash).cmp(&(b.created_at, &b.hash)))
}

/// Whether the task's pin moved since the pusher's `base`. `hash` itself never
/// counts: the pusher's own upload already made it the latest.
pub fn has_moved(versions: &[&TaskVersion], hash: &str, base: Option<&str>) -> bool {
    let Some(base) = base else {
        return versions.iter().any(|v| v.hash != hash);
    };
    let Some(base_version) = versions.iter().find(|v| v.hash == base) else {
        return true;
    };
    versions
        .iter()
        .any(|v| v.hash != base && v.hash != hash && v.created_at > base_version.created_at)
}

/// Pins each entry's hash as its task's latest, all or nothing. `entries` must
/// be validated and name each task once.
pub async fn push(
    db: &DB,
    project_id: &Uuid,
    dataset_id: &str,
    entries: &[PushEntry],
) -> Result<PushOutcome> {
    let task_ids: Vec<&str> = entries.iter().map(|e| e.task.as_str()).collect();
    let mut tx = db.pool.begin().await?;
    db::eval_datasets::lock_tasks(&mut tx, project_id, dataset_id, &task_ids).await?;
    let stored =
        db::eval_datasets::get_task_versions(&mut tx, project_id, dataset_id, &task_ids).await?;
    if let Some(rejection) = check_push(entries, &stored) {
        return Ok(PushOutcome::Rejected(rejection));
    }

    let pins: Vec<TaskHash> = entries
        .iter()
        .map(|e| TaskHash {
            task: e.task.clone(),
            hash: e.hash.clone(),
        })
        .collect();
    let mut pushed =
        db::eval_datasets::touch_versions(&mut tx, project_id, dataset_id, &pins).await?;
    tx.commit().await?;
    pushed.sort_by(|a, b| a.task_id.cmp(&b.task_id));
    Ok(PushOutcome::Pushed(pushed))
}

/// Why a push of `entries` must be refused, given every stored version of their
/// tasks: a version that was never uploaded, else a task whose pin moved.
fn check_push(entries: &[PushEntry], stored: &[TaskVersion]) -> Option<PushRejection> {
    let mut by_task: HashMap<&str, Vec<&TaskVersion>> = HashMap::new();
    for version in stored {
        by_task
            .entry(version.task_id.as_str())
            .or_default()
            .push(version);
    }

    let missing: Vec<TaskHash> = entries
        .iter()
        .filter(|e| {
            !versions_of(&by_task, &e.task)
                .iter()
                .any(|v| v.hash == e.hash)
        })
        .map(|e| TaskHash {
            task: e.task.clone(),
            hash: e.hash.clone(),
        })
        .collect();
    if !missing.is_empty() {
        return Some(PushRejection::VersionsMissing(missing));
    }

    let moved: Vec<MovedTask> = entries
        .iter()
        .filter_map(|e| {
            let versions = versions_of(&by_task, &e.task);
            if !has_moved(versions, &e.hash, e.base.as_deref()) {
                return None;
            }
            // The pusher's own upload is usually the newest; name what moved the pin instead.
            let others: Vec<&TaskVersion> = versions
                .iter()
                .copied()
                .filter(|v| v.hash != e.hash)
                .collect();
            latest(&others)
                .or_else(|| latest(versions))
                .map(|latest| MovedTask {
                    task: e.task.clone(),
                    latest: latest.hash.clone(),
                })
        })
        .collect();
    (!moved.is_empty()).then_some(PushRejection::Moved(moved))
}

fn versions_of<'a>(
    by_task: &'a HashMap<&str, Vec<&'a TaskVersion>>,
    task: &str,
) -> &'a [&'a TaskVersion] {
    by_task.get(task).map(Vec::as_slice).unwrap_or(&[])
}

#[cfg(test)]
mod tests {
    use chrono::{DateTime, Duration, Utc};

    use super::*;

    const H0: &str = "0000000000000000000000000000000000000000000000000000000000000000";
    const H1: &str = "1111111111111111111111111111111111111111111111111111111111111111";
    const H2: &str = "2222222222222222222222222222222222222222222222222222222222222222";

    fn at(seconds: i64) -> DateTime<Utc> {
        DateTime::<Utc>::UNIX_EPOCH + Duration::seconds(seconds)
    }

    fn version(hash: &str, seconds: i64) -> TaskVersion {
        TaskVersion {
            task_id: "t".to_string(),
            hash: hash.to_string(),
            created_at: at(seconds),
        }
    }

    #[test]
    fn names_follow_the_contract() {
        let longest = format!("{}/{}", "o".repeat(127), "n".repeat(127));
        for good in [
            "a/b",
            "A.b-c_d/x1",
            "acme/support",
            "0/9",
            "a.b/c.d",
            longest.as_str(),
        ] {
            assert!(is_dataset_name(good), "{good}");
            assert!(is_task_name(good), "{good}");
        }
        let too_long = format!("{}/{}", "o".repeat(128), "n".repeat(127));
        for bad in [
            "",
            "a",
            "/",
            "a/b/c",
            "/b",
            "a/",
            "a//b",
            ".a/b",
            "a/.b",
            "-a/b",
            "_a/b",
            "a/..b",
            "a..b/c",
            "a/b..",
            "../b",
            "a/..",
            "a/b ",
            "a b/c",
            "a\\b/c",
            "é/b",
            "a/b\n",
            too_long.as_str(),
        ] {
            assert!(!is_dataset_name(bad), "{bad:?}");
            assert!(!is_task_name(bad), "{bad:?}");
        }
    }

    #[test]
    fn hashes_are_64_lowercase_hex() {
        assert!(is_version_hash(H1));
        assert!(is_version_hash(&"af09".repeat(16)));
        for bad in [
            "",
            &H1[..63],
            &format!("{H1}0"),
            &"A".repeat(64),
            &"g".repeat(64),
            &format!("sha256:{}", &H1[..57]),
        ] {
            assert!(!is_version_hash(bad), "{bad}");
        }
    }

    #[test]
    fn keys_are_scoped_by_project_and_dataset() {
        let project_id = Uuid::nil();
        let version = VersionRef {
            dataset: "acme/support".to_string(),
            task: "acme/refund".to_string(),
            hash: H1.to_string(),
        };
        assert_eq!(
            archive_key(&project_id, &version),
            format!("{project_id}/datasets/acme/support/acme/refund/{H1}.tar.gz")
        );
        assert_eq!(
            index_key(&project_id, &version),
            format!("{project_id}/datasets/acme/support/acme/refund/{H1}.index.json")
        );
    }

    #[test]
    fn latest_is_newest_then_greatest_hash() {
        let v0 = version(H0, 1);
        let v1 = version(H1, 3);
        let v2 = version(H2, 3);
        assert_eq!(latest(&[&v0, &v1, &v2]).unwrap().hash, H2);
        assert_eq!(latest(&[&v2, &v0]).unwrap().hash, H2);
        assert!(latest(&[]).is_none());
    }

    #[test]
    fn new_task_moves_only_if_another_version_exists() {
        let mine = version(H1, 5);
        assert!(!has_moved(&[&mine], H1, None));
        let other = version(H0, 1);
        assert!(has_moved(&[&mine, &other], H1, None));
    }

    #[test]
    fn moved_iff_another_version_is_newer_than_base() {
        let base = version(H0, 1);
        let mine = version(H1, 5);
        // Only the pusher's own upload is newer: not moved.
        assert!(!has_moved(&[&base, &mine], H1, Some(H0)));
        // Someone else uploaded or pushed after the base.
        let theirs = version(H2, 3);
        assert!(has_moved(&[&base, &mine, &theirs], H1, Some(H0)));
        // An older version re-pushed after the base counts too.
        let repushed = version(H2, 2);
        assert!(has_moved(&[&base, &repushed], H0, Some(H0)));
        // Versions older than the base don't.
        let older = version(H2, 0);
        assert!(!has_moved(&[&base, &older, &mine], H1, Some(H0)));
    }

    #[test]
    fn unknown_base_has_moved() {
        let mine = version(H1, 5);
        assert!(has_moved(&[&mine], H1, Some(H0)));
    }

    #[test]
    fn repushing_the_base_is_fine_unless_something_newer_exists() {
        let base = version(H0, 1);
        assert!(!has_moved(&[&base], H0, Some(H0)));
        let theirs = version(H1, 2);
        assert!(has_moved(&[&base, &theirs], H0, Some(H0)));
    }

    fn entry(hash: &str, base: Option<&str>) -> PushEntry {
        PushEntry {
            task: "t".to_string(),
            hash: hash.to_string(),
            base: base.map(str::to_string),
        }
    }

    #[test]
    fn push_checks_missing_versions_before_moved_pins() {
        let stored = vec![version(H0, 1), version(H2, 3)];
        let Some(PushRejection::VersionsMissing(missing)) =
            check_push(&[entry(H1, Some(H0))], &stored)
        else {
            panic!("expected versions_missing");
        };
        assert_eq!(
            missing,
            vec![TaskHash {
                task: "t".to_string(),
                hash: H1.to_string(),
            }]
        );

        let Some(PushRejection::Moved(moved)) = check_push(&[entry(H0, Some(H0))], &stored) else {
            panic!("expected moved");
        };
        assert_eq!(
            moved,
            vec![MovedTask {
                task: "t".to_string(),
                latest: H2.to_string(),
            }]
        );

        assert!(check_push(&[entry(H2, Some(H0))], &stored).is_none());

        // The pusher's own, newest upload isn't what moved the pin.
        let stored = vec![version(H0, 1), version(H2, 3), version(H1, 5)];
        let Some(PushRejection::Moved(moved)) = check_push(&[entry(H1, Some(H0))], &stored) else {
            panic!("expected moved");
        };
        assert_eq!(moved[0].latest, H2);
    }
}
