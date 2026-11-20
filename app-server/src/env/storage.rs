//! S3 storage configuration. AWS credentials live in [`super::secrets`]; their
//! presence enables the Storage feature.

/// S3 bucket for legacy dataset parquet exports. Unset: those exports are off.
pub const S3_EXPORTS_BUCKET: &str = "S3_EXPORTS_BUCKET";
/// S3 bucket for eval dataset task versions (`src/datasets_v2/`). Keys start with
/// the project id; nothing expires them. No default: bucket names are global, so
/// a default could point a deployment at a bucket someone else owns. Unset: eval
/// datasets answer `storage_not_configured`.
pub const DATASETS_BUCKET: &str = "S3_DATASETS_BUCKET";
/// S3 bucket for remote eval runs' uploads and Harbor job output
/// (`src/hosted_evals/`). Keys start with the project id; meant to have a
/// lifecycle rule expiring objects (~90 days). No default, as above.
pub const HOSTED_EVALS_BUCKET: &str = "S3_HOSTED_EVALS_BUCKET";
