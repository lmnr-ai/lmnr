//! Alert writes for the CLI and the Laminar agent. Everything about them (validation, `notifyMe`,
//! Slack channel lookup) lives in the frontend's `lib/actions/alerts/cli.ts`, shared with the
//! settings form; this module forwards through `next_api` as `user_id`, whose email `notifyMe`
//! subscribes. Reads go through SQL (`alerts`, `alert_targets`, `alert_filters`).
//!
//! Bodies and results are the frontend's shapes (`CreateAlertBodySchema` / `UpdateAlertBodySchema`
//! in, `CliAlert` out), forwarded unparsed so the frontend stays their one definition.

use reqwest::Method;
use serde_json::Value;
use uuid::Uuid;

use crate::next_api::{self, NextApiError};

fn alert_path(alert_id: Uuid) -> String {
    format!("alerts/{alert_id}")
}

pub async fn create_alert(
    http_client: &reqwest::Client,
    project_id: Uuid,
    user_id: Uuid,
    body: Value,
) -> Result<Value, NextApiError> {
    next_api::call_as(
        http_client,
        Method::POST,
        project_id,
        user_id,
        "alerts",
        Some(body),
    )
    .await
}

/// Omitted fields are kept; a 404 when the alert is not in the project.
pub async fn update_alert(
    http_client: &reqwest::Client,
    project_id: Uuid,
    user_id: Uuid,
    alert_id: Uuid,
    body: Value,
) -> Result<Value, NextApiError> {
    let path = alert_path(alert_id);
    next_api::call_as(
        http_client,
        Method::PATCH,
        project_id,
        user_id,
        &path,
        Some(body),
    )
    .await
}

/// Targets and filters go with it.
pub async fn delete_alert(
    http_client: &reqwest::Client,
    project_id: Uuid,
    user_id: Uuid,
    alert_id: Uuid,
) -> Result<(), NextApiError> {
    let path = alert_path(alert_id);
    let _: Value = next_api::call_as(
        http_client,
        Method::DELETE,
        project_id,
        user_id,
        &path,
        None,
    )
    .await?;
    Ok(())
}
