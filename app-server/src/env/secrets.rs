//! Credentials and encryption keys. Always required where used (no defaults),
//! so they're bare name constants and the read/validate logic stays at the
//! call site.

/// AWS credentials. Used for S3 storage and (optionally) Bedrock LLM.
pub const AWS_ACCESS_KEY_ID: &str = "AWS_ACCESS_KEY_ID";
pub const AWS_SECRET_ACCESS_KEY: &str = "AWS_SECRET_ACCESS_KEY";
/// AWS region. Defaults to `us-east-1` at the S3 config call site.
pub const AWS_REGION: &str = "AWS_REGION";

/// 32-byte hex AEAD key for data-plane payload encryption.
pub const AEAD_SECRET_KEY: &str = "AEAD_SECRET_KEY";
/// Hex key for Slack token encrypt/decrypt (mirrors the frontend).
pub const SLACK_ENCRYPTION_KEY: &str = "SLACK_ENCRYPTION_KEY";

/// Resend API key for transactional email. Presence enables the email client.
pub const RESEND_API_KEY: &str = "RESEND_API_KEY";
