//! Eval datasets (LAM-2562): versioned Harbor task folders that `lmnr-cli eval
//! dataset pull / push` syncs. A version is a content hash the CLI computes; its
//! archive and file index live in S3, the dataset/task/version rows in Postgres.
//! Versions are independent: which one a dataset uses is its `dataset.toml` pin,
//! kept in the user's git. See `docs/internal/eval-datasets.md`.

use uuid::Uuid;

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

/// The version's archive (lmnr-cli `pack.ts` output), in the datasets bucket.
pub fn archive_key(project_id: &Uuid, version: &VersionRef) -> String {
    format!("{}.tar.gz", key_prefix(project_id, version))
}

/// The archive's file index (`hosted_evals::ArchiveIndex`), read by the frontend's file view.
pub fn index_key(project_id: &Uuid, version: &VersionRef) -> String {
    format!("{}.index.json", key_prefix(project_id, version))
}

/// `<project_id>/<org>/<name>/<task org>/<task name>/<hash>`. A valid name
/// is exactly two segments, neither empty nor a dot segment, so the layout is fixed
/// and distinct versions never share a key.
fn key_prefix(project_id: &Uuid, version: &VersionRef) -> String {
    format!(
        "{project_id}/{}/{}/{}",
        version.dataset, version.task, version.hash
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    const H1: &str = "1111111111111111111111111111111111111111111111111111111111111111";

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
            format!("{project_id}/acme/support/acme/refund/{H1}.tar.gz")
        );
        assert_eq!(
            index_key(&project_id, &version),
            format!("{project_id}/acme/support/acme/refund/{H1}.index.json")
        );
    }
}
