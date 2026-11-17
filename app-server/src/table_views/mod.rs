//! Saved table view writes for the CLI. Validation, the `isDefault` flag and the config
//! merge live in the frontend's `lib/actions/view`, shared with the UI; this module forwards through
//! `next_api`. Reads go through SQL (`table_views`).
//!
//! Bodies and results are the frontend's shapes, forwarded unparsed so the frontend stays their one
//! definition. An update merges the top-level `config` keys it sends into the stored config.

use reqwest::Method;
use serde_json::Value;
use uuid::Uuid;

use crate::next_api::{self, NextApiError};

fn view_path(view_id: Uuid) -> String {
    format!("views/{view_id}")
}

pub async fn create_view(
    http_client: &reqwest::Client,
    project_id: Uuid,
    body: Value,
) -> Result<Value, NextApiError> {
    next_api::call(http_client, Method::POST, project_id, "views", Some(body)).await
}

/// A 404 when the view is not in the project.
pub async fn update_view(
    http_client: &reqwest::Client,
    project_id: Uuid,
    view_id: Uuid,
    body: Value,
) -> Result<Value, NextApiError> {
    let path = view_path(view_id);
    next_api::call(http_client, Method::PATCH, project_id, &path, Some(body)).await
}

pub async fn delete_view(
    http_client: &reqwest::Client,
    project_id: Uuid,
    view_id: Uuid,
) -> Result<(), NextApiError> {
    let path = view_path(view_id);
    let _: Value = next_api::call(http_client, Method::DELETE, project_id, &path, None).await?;
    Ok(())
}
