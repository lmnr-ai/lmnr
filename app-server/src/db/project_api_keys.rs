use anyhow::Result;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool, Row, postgres::PgRow};
use uuid::Uuid;

/// Authenticated credential for a project request. One variant per
/// auth scheme — `ApiKey` for traditional SHA3-hashed bearer tokens,
/// `AccessToken` for OAuth device-flow JWTs. Downstream handlers only
/// look at `project_id` / `is_ingest_only`; the kind-specific fields
/// are kept around for logging/audit and to leave room for future
/// claims (sub, email, scope) without another rename.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectAuth {
    pub project_id: Uuid,
    pub name: Option<String>,
    pub shorthand: String,
    pub is_ingest_only: bool,
    pub kind: CredentialKind,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum CredentialKind {
    ApiKey { hash: String },
    AccessToken { jti: Uuid },
}

impl ProjectAuth {
    #[allow(dead_code)]
    pub fn is_api_key(&self) -> bool {
        matches!(self.kind, CredentialKind::ApiKey { .. })
    }

    #[allow(dead_code)]
    pub fn jti(&self) -> Option<Uuid> {
        match &self.kind {
            CredentialKind::AccessToken { jti } => Some(*jti),
            _ => None,
        }
    }
}

impl FromRow<'_, PgRow> for ProjectAuth {
    fn from_row(row: &PgRow) -> sqlx::Result<Self> {
        Ok(Self {
            project_id: row.try_get("project_id")?,
            name: row.try_get("name")?,
            shorthand: row.try_get("shorthand")?,
            is_ingest_only: row.try_get("is_ingest_only")?,
            kind: CredentialKind::ApiKey {
                hash: row.try_get("hash")?,
            },
        })
    }
}

pub async fn get_api_key(pool: &PgPool, hash: &String) -> Result<ProjectAuth> {
    let api_key = match sqlx::query_as::<_, ProjectAuth>(
        "SELECT
            project_api_keys.hash,
            project_api_keys.project_id,
            project_api_keys.name,
            project_api_keys.id,
            project_api_keys.shorthand,
            project_api_keys.is_ingest_only
        FROM
            project_api_keys
        WHERE
            project_api_keys.hash = $1",
    )
    .bind(hash)
    .fetch_optional(pool)
    .await
    {
        Ok(None) => Err(anyhow::anyhow!("invalid project API key")),
        Ok(Some(api_key)) => Ok(api_key),
        Err(e) => Err(e.into()),
    }?;

    Ok(api_key)
}
