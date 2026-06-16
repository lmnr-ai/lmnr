//! S3 storage configuration. AWS credentials live in [`super::secrets`].

/// S3 bucket for dataset/parquet exports. Presence (plus AWS creds) enables
/// the Storage feature.
pub const S3_EXPORTS_BUCKET: &str = "S3_EXPORTS_BUCKET";
