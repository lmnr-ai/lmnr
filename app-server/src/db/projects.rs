use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool, types::Json};
use uuid::Uuid;

/// Read-only view of `projects.settings` JSONB. Writes happen exclusively
/// from the Next.js side; the Rust app-server only deserializes. New
/// settings = add a `#[serde(default)]` field — no migration. Unknown keys
/// are tolerated for forward-compat (frontend may ship a key the app-server
/// hasn't learned about yet during a rolling deploy).
#[derive(Deserialize, Serialize, Default, Clone, Debug)]
#[serde(default, rename_all = "camelCase")]
pub struct ProjectSettings {
    /// PII redaction toggle. Enabling routes every span on this project
    /// through the pii-redactor before storage. Pro-tier gated frontend-side.
    pub remove_pii: bool,
}

#[derive(Deserialize, Serialize, FromRow, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProjectWithWorkspaceBillingInfoDbRow {
    pub id: Uuid,
    pub name: String,
    pub workspace_id: Uuid,
    pub tier_name: String,
    pub reset_time: DateTime<Utc>,
    pub workspace_project_ids: Vec<Uuid>,
    pub bytes_limit: i64,
    pub signal_steps_limit: i64,
    /// Custom hard limit for bytes, configured by the user. Overrides tier limit when set.
    #[serde(default)]
    pub custom_bytes_limit: Option<i64>,
    /// Custom hard limit for signal runs, configured by the user. Overrides tier limit when set.
    #[serde(default)]
    pub custom_signal_steps_limit: Option<i64>,
    /// `projects.settings` JSONB, opaque to the SQL row binding (we hand it
    /// to serde_json on the way into the typed `ProjectWithWorkspaceBillingInfo`).
    #[serde(default)]
    pub settings: Json<serde_json::Value>,
}

#[derive(Deserialize, Serialize, Default, PartialEq, Eq, Clone, Debug)]
pub enum WorkspaceTierName {
    Free,
    Pro,
    Hobby,
    #[default]
    Other,
}

impl WorkspaceTierName {
    fn from_str(s: &str) -> Self {
        match s.trim().to_lowercase().as_str() {
            "free" => Self::Free,
            "hobby" => Self::Hobby,
            "pro" => Self::Pro,
            x => {
                log::warn!("Unknown workspace tier name: {}", x);
                Self::Other
            }
        }
    }

    pub fn is_free(&self) -> bool {
        *self == WorkspaceTierName::Free
    }

    /// Bytes included in this tier's monthly plan. Must stay in sync with the
    /// `TIER_CONFIG.includedBytes` values in `frontend/lib/actions/checkout/types.ts`.
    /// Used to detect when a usage warning was hit at the tier's included
    /// allowance (vs. a user-configured custom warning) so we can tailor the
    /// warning email.
    pub fn included_bytes(&self) -> Option<i64> {
        match self {
            // Free tier: spec keeps the free plan at its historical 1 GiB allowance.
            Self::Free => Some(1024i64.pow(3)),
            Self::Hobby => Some(3 * 1024i64.pow(3)),
            Self::Pro => Some(10 * 1024i64.pow(3)),
            Self::Other => None,
        }
    }

    /// Signal steps included in this tier's monthly plan. Must stay in sync
    /// with `TIER_CONFIG.includedSignalSteps` values in the frontend.
    pub fn included_signal_steps(&self) -> Option<i64> {
        match self {
            Self::Free => Some(500),
            Self::Hobby => Some(5_000),
            Self::Pro => Some(50_000),
            Self::Other => None,
        }
    }

    pub fn display_name(&self) -> &'static str {
        match self {
            Self::Free => "Free",
            Self::Hobby => "Hobby",
            Self::Pro => "Pro",
            Self::Other => "your",
        }
    }
}

#[derive(Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProjectWithWorkspaceBillingInfo {
    pub id: Uuid,
    pub name: String,
    pub workspace_id: Uuid,
    pub tier_name: WorkspaceTierName,
    pub reset_time: DateTime<Utc>,
    pub workspace_project_ids: Vec<Uuid>,
    pub bytes_limit: i64,
    pub signal_steps_limit: i64,
    /// Custom hard limit for bytes, configured by the user. Overrides tier limit when set.
    #[serde(default)]
    pub custom_bytes_limit: Option<i64>,
    /// Custom hard limit for signal runs, configured by the user. Overrides tier limit when set.
    #[serde(default)]
    pub custom_signal_steps_limit: Option<i64>,
    /// Typed view of `projects.settings`. Unknown keys are tolerated;
    /// missing keys fall back to the field's `Default` impl.
    #[serde(default)]
    pub settings: ProjectSettings,
}

impl Into<ProjectWithWorkspaceBillingInfo> for ProjectWithWorkspaceBillingInfoDbRow {
    fn into(self) -> ProjectWithWorkspaceBillingInfo {
        // Tolerate malformed JSON: log and fall back to defaults so a single
        // hand-edited row can't poison the cache for the whole project.
        let settings = serde_json::from_value::<ProjectSettings>(self.settings.0)
            .unwrap_or_else(|e| {
                log::warn!("project[{}] settings JSON malformed, using defaults: {e:#}", self.id);
                ProjectSettings::default()
            });
        ProjectWithWorkspaceBillingInfo {
            id: self.id,
            name: self.name,
            workspace_id: self.workspace_id,
            tier_name: WorkspaceTierName::from_str(&self.tier_name),
            reset_time: self.reset_time,
            workspace_project_ids: self.workspace_project_ids,
            bytes_limit: self.bytes_limit,
            signal_steps_limit: self.signal_steps_limit,
            custom_bytes_limit: self.custom_bytes_limit,
            custom_signal_steps_limit: self.custom_signal_steps_limit,
            settings,
        }
    }
}

#[derive(FromRow, Debug, Clone)]
pub struct ProjectInfo {
    pub id: Uuid,
    pub name: String,
}

pub async fn get_projects_for_workspace(
    pool: &PgPool,
    workspace_id: &Uuid,
) -> anyhow::Result<Vec<ProjectInfo>> {
    let projects =
        sqlx::query_as::<_, ProjectInfo>("SELECT id, name FROM projects WHERE workspace_id = $1")
            .bind(workspace_id)
            .fetch_all(pool)
            .await?;

    Ok(projects)
}

/// Returns true if `user_id` is a member of the workspace that owns `project_id`.
/// Any membership grants access (no role filter) — this is the per-request
/// authorization for the CLI user-token surface (`/v1/cli/*`).
pub async fn project_has_member(
    pool: &PgPool,
    user_id: &Uuid,
    project_id: &Uuid,
) -> anyhow::Result<bool> {
    let exists = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS (
            SELECT 1 FROM projects p
            JOIN members_of_workspaces m ON m.workspace_id = p.workspace_id
            WHERE p.id = $1 AND m.user_id = $2
        )",
    )
    .bind(project_id)
    .bind(user_id)
    .fetch_one(pool)
    .await?;

    Ok(exists)
}

/// A project the user can access, with its owning workspace. Backs the CLI
/// `GET /v1/cli/projects` discovery endpoint.
#[derive(Serialize, FromRow, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CliProject {
    pub id: Uuid,
    pub name: String,
    pub workspace_id: Uuid,
    pub workspace_name: String,
}

/// All projects in workspaces the user is a member of (any role), ordered by
/// workspace then project name. Used by the CLI to let the user discover and
/// select a project after `login`.
pub async fn get_projects_for_user(pool: &PgPool, user_id: &Uuid) -> anyhow::Result<Vec<CliProject>> {
    let projects = sqlx::query_as::<_, CliProject>(
        "SELECT p.id, p.name, w.id AS workspace_id, w.name AS workspace_name
         FROM projects p
         JOIN members_of_workspaces m ON m.workspace_id = p.workspace_id
         JOIN workspaces w ON w.id = p.workspace_id
         WHERE m.user_id = $1
         ORDER BY w.name, p.name",
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;

    Ok(projects)
}

pub async fn get_project_and_workspace_billing_info(
    pool: &PgPool,
    project_id: &Uuid,
) -> Result<Option<ProjectWithWorkspaceBillingInfo>> {
    let result = sqlx::query_as::<_, ProjectWithWorkspaceBillingInfoDbRow>(
        "
        WITH workspace_project_ids AS (
            SELECT array_agg(id) as project_ids,
                workspace_id
            FROM projects
            GROUP BY workspace_id
        )
        SELECT
            projects.id,
            projects.name,
            projects.workspace_id,
            subscription_tiers.name as tier_name,
            workspaces.reset_time,
            COALESCE(workspace_project_ids.project_ids, '{}') as workspace_project_ids,
            subscription_tiers.bytes_ingested as bytes_limit,
            subscription_tiers.signal_steps_processed as signal_steps_limit,
            wul_bytes.limit_value as custom_bytes_limit,
            wul_signal_steps.limit_value as custom_signal_steps_limit,
            projects.settings
        FROM
            projects
            join workspaces on projects.workspace_id = workspaces.id
            join subscription_tiers on workspaces.tier_id = subscription_tiers.id
            LEFT join workspace_project_ids on projects.workspace_id = workspace_project_ids.workspace_id
            LEFT join workspace_usage_limits wul_bytes
                on wul_bytes.workspace_id = workspaces.id AND wul_bytes.limit_type = 'bytes'
            LEFT join workspace_usage_limits wul_signal_steps
                on wul_signal_steps.workspace_id = workspaces.id AND wul_signal_steps.limit_type = 'signal_steps_processed'
        WHERE
            projects.id = $1",
    )
    .bind(project_id)
    .fetch_optional(pool)
    .await?;

    Ok(result.map(|r| r.into()))
}
