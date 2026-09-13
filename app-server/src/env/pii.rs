//! PII redaction tunables (`src/pii_redactor`). The redactor endpoint itself
//! is `connections::PII_REDACTOR_URL`.

use super::BoolEnv;

/// Enables the `dual` PII mode: raw and redacted copies are both stored and
/// the read path masks per role (docs/internal/rbac.md). While off, projects
/// configured as `dual` are ingested as `redact`.
pub const DUAL_MODE_ENABLED: BoolEnv = BoolEnv::new("PII_DUAL_MODE_ENABLED", false);
