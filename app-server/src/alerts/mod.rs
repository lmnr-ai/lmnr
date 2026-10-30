//! Alert CRUD for the CLI (`api::v1::cli::alerts`). The frontend writes the same rows through
//! Drizzle (`lib/actions/alerts`, `lib/actions/alert-filters`); the metadata shape and the
//! email-target privacy rule match it. A caller only ever sees or edits their own email target.

use std::collections::{BTreeSet, HashMap};

use actix_web::HttpResponse;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};
use sqlx::PgPool;
use uuid::Uuid;

use crate::cache::{Cache, CacheTrait, keys::ALERT_FILTERS_CACHE_KEY};
use crate::db::alerts::{self as db, AlertRow, NewAlertTarget};
use crate::db::slack_integrations;
use crate::db::utils::Filter;
use crate::notifications::{
    AlertType,
    slack::{self, ChannelLookup},
};

const TARGET_EMAIL: &str = "EMAIL";
const TARGET_SLACK: &str = "SLACK";

#[derive(Debug, thiserror::Error)]
pub enum AlertError {
    #[error("{0}")]
    Validation(String),
    #[error("{0} not found")]
    NotFound(&'static str),
    #[error(transparent)]
    Internal(#[from] anyhow::Error),
}

impl From<sqlx::Error> for AlertError {
    fn from(e: sqlx::Error) -> Self {
        Self::Internal(e.into())
    }
}

pub fn error_response(e: AlertError) -> HttpResponse {
    match e {
        AlertError::Validation(m) => HttpResponse::BadRequest().json(json!({ "error": m })),
        e @ AlertError::NotFound(_) => {
            HttpResponse::NotFound().json(json!({ "error": e.to_string() }))
        }
        AlertError::Internal(err) => {
            log::error!("Alert write failed: {err:?}");
            HttpResponse::InternalServerError().json(json!({ "error": "Internal server error" }))
        }
    }
}

/// Stored as 0/1/2 in `alerts.metadata.severities`; names on the wire.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    Info,
    Warning,
    Critical,
}

impl Severity {
    fn level(self) -> u8 {
        match self {
            Self::Info => 0,
            Self::Warning => 1,
            Self::Critical => 2,
        }
    }

    fn from_level(level: u64) -> Option<Self> {
        match level {
            0 => Some(Self::Info),
            1 => Some(Self::Warning),
            2 => Some(Self::Critical),
            _ => None,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateAlertInput {
    pub signal_id: Uuid,
    /// Defaults to `"<signal name> alert"`, like the alerts created with a signal.
    #[serde(default)]
    pub name: Option<String>,
    /// `SIGNAL_EVENT` (default) or `NEW_CLUSTER`.
    #[serde(default)]
    pub r#type: Option<String>,
    /// `SIGNAL_EVENT` only. Defaults to `["critical"]`.
    #[serde(default)]
    pub severities: Option<Vec<Severity>>,
    #[serde(default)]
    pub skip_similar: Option<bool>,
    #[serde(default)]
    pub disabled: Option<bool>,
    /// Send the alert to the caller's email. Defaults to true.
    #[serde(default)]
    pub notify_me: Option<bool>,
    /// Channel ids or names in the workspace's connected Slack.
    #[serde(default)]
    pub slack_channels: Option<Vec<String>>,
    /// Filter groups: conditions in a group are ANDed, groups are ORed.
    #[serde(default)]
    pub filters: Option<Vec<Vec<Filter>>>,
}

/// A partial patch: omitted fields keep their stored value. `slackChannels` and `filters`
/// replace the whole list (`[]` clears it). The type and signal can't change.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAlertInput {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub severities: Option<Vec<Severity>>,
    #[serde(default)]
    pub skip_similar: Option<bool>,
    #[serde(default)]
    pub disabled: Option<bool>,
    #[serde(default)]
    pub notify_me: Option<bool>,
    #[serde(default)]
    pub slack_channels: Option<Vec<String>>,
    #[serde(default)]
    pub filters: Option<Vec<Vec<Filter>>>,
}

impl UpdateAlertInput {
    fn is_empty(&self) -> bool {
        self.name.is_none()
            && self.severities.is_none()
            && self.skip_similar.is_none()
            && self.disabled.is_none()
            && self.notify_me.is_none()
            && self.slack_channels.is_none()
            && self.filters.is_none()
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SlackTarget {
    pub channel_id: String,
    pub channel_name: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AlertResponse {
    pub id: Uuid,
    pub name: String,
    pub r#type: String,
    pub signal_id: Uuid,
    pub signal_name: Option<String>,
    /// Empty for `NEW_CLUSTER` alerts.
    pub severities: Vec<Severity>,
    pub skip_similar: bool,
    pub disabled: bool,
    /// Whether the caller's email is a target. Other members' emails are never returned.
    pub notify_me: bool,
    pub slack_channels: Vec<SlackTarget>,
    pub filters: Vec<Value>,
    pub created_at: DateTime<Utc>,
}

/// What a write needs beyond the pool.
pub struct AlertWriteContext<'a> {
    pub pool: &'a PgPool,
    pub cache: &'a Cache,
    pub http_client: &'a reqwest::Client,
    pub project_id: Uuid,
    pub user_email: Option<&'a str>,
    pub clustering_enabled: bool,
}

pub async fn list_alerts(
    pool: &PgPool,
    project_id: Uuid,
    signal_id: Option<Uuid>,
    user_email: Option<&str>,
) -> Result<Vec<AlertResponse>, AlertError> {
    let rows = db::query_alerts(pool, project_id, signal_id, None).await?;
    with_details(pool, project_id, rows, user_email).await
}

pub async fn get_alert(
    pool: &PgPool,
    project_id: Uuid,
    alert_id: Uuid,
    user_email: Option<&str>,
) -> Result<AlertResponse, AlertError> {
    let rows = db::query_alerts(pool, project_id, None, Some(alert_id)).await?;
    with_details(pool, project_id, rows, user_email)
        .await?
        .pop()
        .ok_or(AlertError::NotFound("Alert"))
}

pub async fn create_alert(
    ctx: &AlertWriteContext<'_>,
    input: CreateAlertInput,
) -> Result<AlertResponse, AlertError> {
    let alert_type = match input.r#type.as_deref() {
        None => AlertType::SignalEvent,
        Some(raw) => raw.parse::<AlertType>().map_err(|_| {
            AlertError::Validation(format!(
                "type must be SIGNAL_EVENT or NEW_CLUSTER, got \"{raw}\""
            ))
        })?,
    };
    // Gated on create only: the frontend adds a cluster alert to every signal regardless of
    // clustering, and those must stay editable (rename, disable, targets).
    if alert_type == AlertType::NewCluster && !ctx.clustering_enabled {
        return Err(AlertError::Validation(
            "NEW_CLUSTER alerts need clustering, which isn't available on this deployment"
                .to_string(),
        ));
    }
    let (signal_name, schema) = db::get_signal_schema(ctx.pool, ctx.project_id, input.signal_id)
        .await?
        .ok_or(AlertError::NotFound("Signal"))?;

    let name = match &input.name {
        Some(name) => validate_name(name)?,
        None => format!("{signal_name} alert"),
    };
    let metadata = build_metadata(
        alert_type,
        &MetadataPatch {
            severities: create_severities(alert_type, input.severities),
            skip_similar: input.skip_similar,
            disabled: input.disabled,
        },
        &Value::Null,
        ctx.clustering_enabled,
    )?;
    let filters = input
        .filters
        .map(|groups| validate_filters(alert_type, groups, &schema))
        .transpose()?;
    let slack = match &input.slack_channels {
        Some(refs) => resolve_slack_channels(ctx, refs).await?,
        None => Vec::new(),
    };
    let email = match input.notify_me {
        Some(true) => Some(require_email(ctx.user_email)?),
        Some(false) => None,
        // Default on, but an account without an email simply gets no email target.
        None => ctx.user_email,
    };

    let mut tx = ctx.pool.begin().await?;
    let alert_id = db::insert_alert(
        &mut tx,
        ctx.project_id,
        &name,
        alert_type.as_str(),
        input.signal_id,
        &metadata,
    )
    .await?;
    let mut targets = slack_targets(&slack);
    if let Some(email) = email {
        targets.push(email_target(email));
    }
    db::insert_targets(&mut tx, ctx.project_id, alert_id, &targets).await?;
    if let Some(filters) = &filters {
        db::replace_filters(&mut tx, ctx.project_id, alert_id, filters).await?;
    }
    tx.commit().await?;

    get_alert(ctx.pool, ctx.project_id, alert_id, ctx.user_email).await
}

pub async fn update_alert(
    ctx: &AlertWriteContext<'_>,
    alert_id: Uuid,
    input: UpdateAlertInput,
) -> Result<AlertResponse, AlertError> {
    if input.is_empty() {
        return Err(AlertError::Validation(
            "Nothing to update. Pass at least one of name, severities, skipSimilar, disabled, \
             notifyMe, slackChannels, filters."
                .to_string(),
        ));
    }
    let name = input.name.as_deref().map(validate_name).transpose()?;
    // Slack lookups are network calls, so they run before the row lock is taken.
    let slack = match &input.slack_channels {
        Some(refs) => Some(resolve_slack_channels(ctx, refs).await?),
        None => None,
    };
    let email = match input.notify_me {
        Some(true) => Some(require_email(ctx.user_email)?),
        Some(false) => ctx.user_email,
        None => None,
    };

    let mut tx = ctx.pool.begin().await?;
    let (stored_type, signal_id, stored_metadata) =
        db::lock_alert(&mut tx, ctx.project_id, alert_id)
            .await?
            .ok_or(AlertError::NotFound("Alert"))?;
    let alert_type = stored_type.parse::<AlertType>().map_err(|_| {
        AlertError::Internal(anyhow::anyhow!(
            "alert {alert_id} has unknown type {stored_type}"
        ))
    })?;
    let metadata = build_metadata(
        alert_type,
        &MetadataPatch {
            severities: input.severities,
            skip_similar: input.skip_similar,
            disabled: input.disabled,
        },
        &stored_metadata,
        ctx.clustering_enabled,
    )?;
    let filters = match input.filters {
        Some(groups) => {
            let (_, schema) = db::get_signal_schema(ctx.pool, ctx.project_id, signal_id)
                .await?
                .ok_or_else(|| {
                    AlertError::Validation(
                        "The alert's signal no longer exists, so its filters can't be checked"
                            .to_string(),
                    )
                })?;
            Some(validate_filters(alert_type, groups, &schema)?)
        }
        None => None,
    };

    db::update_alert(
        &mut tx,
        ctx.project_id,
        alert_id,
        name.as_deref(),
        &metadata,
    )
    .await?;
    if let Some(slack) = &slack {
        db::delete_slack_targets(&mut tx, ctx.project_id, alert_id).await?;
        db::insert_targets(&mut tx, ctx.project_id, alert_id, &slack_targets(slack)).await?;
    }
    if let Some(email) = email {
        // Delete then re-insert so `notifyMe: true` is idempotent.
        db::delete_email_target(&mut tx, ctx.project_id, alert_id, email).await?;
        if input.notify_me == Some(true) {
            db::insert_targets(&mut tx, ctx.project_id, alert_id, &[email_target(email)]).await?;
        }
    }
    if let Some(filters) = &filters {
        db::replace_filters(&mut tx, ctx.project_id, alert_id, filters).await?;
    }
    tx.commit().await?;

    invalidate_filters(ctx.cache, ctx.project_id, alert_id).await;
    get_alert(ctx.pool, ctx.project_id, alert_id, ctx.user_email).await
}

pub async fn delete_alert(
    pool: &PgPool,
    cache: &Cache,
    project_id: Uuid,
    alert_id: Uuid,
) -> Result<(), AlertError> {
    if !db::delete_alert(pool, project_id, alert_id).await? {
        return Err(AlertError::NotFound("Alert"));
    }
    invalidate_filters(cache, project_id, alert_id).await;
    Ok(())
}

/// The cached filter rules the signal-event pipeline reads per `(project, alert)`.
async fn invalidate_filters(cache: &Cache, project_id: Uuid, alert_id: Uuid) {
    let key = format!("{ALERT_FILTERS_CACHE_KEY}:{project_id}:{alert_id}");
    if let Err(e) = cache.remove(&key).await {
        log::error!("Failed to invalidate alert filters cache {key}: {e:?}");
    }
}

async fn with_details(
    pool: &PgPool,
    project_id: Uuid,
    rows: Vec<AlertRow>,
    user_email: Option<&str>,
) -> Result<Vec<AlertResponse>, AlertError> {
    let ids: Vec<Uuid> = rows.iter().map(|r| r.id).collect();
    let mut targets: HashMap<Uuid, Vec<db::AlertTargetRow>> = HashMap::new();
    for target in db::get_targets(pool, project_id, &ids).await? {
        targets.entry(target.alert_id).or_default().push(target);
    }
    let mut filters: HashMap<Uuid, Vec<Value>> = HashMap::new();
    for filter in db::get_filters(pool, project_id, &ids).await? {
        filters
            .entry(filter.alert_id)
            .or_default()
            .push(filter.value);
    }

    Ok(rows
        .into_iter()
        .map(|row| {
            let targets = targets.remove(&row.id).unwrap_or_default();
            let notify_me = user_email.is_some_and(|email| {
                targets
                    .iter()
                    .any(|t| t.r#type == TARGET_EMAIL && t.email.as_deref() == Some(email))
            });
            let slack_channels = targets
                .into_iter()
                .filter(|t| t.r#type == TARGET_SLACK)
                .filter_map(|t| {
                    Some(SlackTarget {
                        channel_id: t.channel_id?,
                        channel_name: t.channel_name,
                    })
                })
                .collect();
            let is_signal_event = row.r#type == AlertType::SignalEvent.as_str();
            AlertResponse {
                severities: if is_signal_event {
                    stored_severities(&row.metadata)
                } else {
                    Vec::new()
                },
                skip_similar: row.metadata.get("skipSimilar").and_then(Value::as_bool)
                    == Some(true),
                disabled: row.metadata.get("disabled").and_then(Value::as_bool) == Some(true),
                notify_me,
                slack_channels,
                filters: filters.remove(&row.id).unwrap_or_default(),
                id: row.id,
                name: row.name,
                r#type: row.r#type,
                signal_id: row.source_id,
                signal_name: row.signal_name,
                created_at: row.created_at,
            }
        })
        .collect())
}

fn validate_name(name: &str) -> Result<String, AlertError> {
    let name = name.trim();
    if name.is_empty() {
        return Err(AlertError::Validation("name must not be blank".to_string()));
    }
    Ok(name.to_string())
}

fn require_email(email: Option<&str>) -> Result<&str, AlertError> {
    email.ok_or_else(|| {
        AlertError::Validation("Your account has no email, so notifyMe can't be set".to_string())
    })
}

fn email_target(email: &str) -> NewAlertTarget<'_> {
    NewAlertTarget {
        r#type: TARGET_EMAIL,
        integration_id: None,
        channel_id: None,
        channel_name: None,
        email: Some(email),
    }
}

fn slack_targets(channels: &[(Uuid, slack::SlackChannel)]) -> Vec<NewAlertTarget<'_>> {
    channels
        .iter()
        .map(|(integration_id, channel)| NewAlertTarget {
            r#type: TARGET_SLACK,
            integration_id: Some(*integration_id),
            channel_id: Some(&channel.id),
            channel_name: Some(&channel.name),
            email: None,
        })
        .collect()
}

/// Resolves each id or name against the workspace's Slack, deduplicated by channel id.
async fn resolve_slack_channels(
    ctx: &AlertWriteContext<'_>,
    refs: &[String],
) -> Result<Vec<(Uuid, slack::SlackChannel)>, AlertError> {
    if refs.is_empty() {
        return Ok(Vec::new());
    }
    let (integration_id, integration) =
        slack_integrations::get_integration_for_project(ctx.pool, ctx.project_id)
            .await?
            .ok_or_else(|| {
                AlertError::Validation(
                    "Slack isn't connected to this workspace. Connect it in Settings → \
                     Integrations first."
                        .to_string(),
                )
            })?;
    let token = slack::decode_slack_token(
        &integration.team_id,
        &integration.nonce_hex,
        &integration.token,
    )?;

    let mut channels: Vec<(Uuid, slack::SlackChannel)> = Vec::new();
    for reference in refs {
        let channel = match slack::find_channel(ctx.http_client, &token, reference).await? {
            ChannelLookup::Found(channel) => channel,
            ChannelLookup::NotFound { rate_limited } => {
                return Err(AlertError::Validation(if rate_limited {
                    format!(
                        "Slack rate-limited the channel lookup before \"{reference}\" was found; \
                         retry in a minute or pass the channel id"
                    )
                } else {
                    format!(
                        "No Slack channel \"{reference}\" in the connected workspace (archived \
                         channels and private channels the Laminar app isn't in are not listed)"
                    )
                }));
            }
        };
        if !channels.iter().any(|(_, c)| c.id == channel.id) {
            channels.push((integration_id, channel));
        }
    }
    Ok(channels)
}

/// A new `SIGNAL_EVENT` alert defaults to critical only; `NEW_CLUSTER` has no severities.
fn create_severities(alert_type: AlertType, given: Option<Vec<Severity>>) -> Option<Vec<Severity>> {
    match alert_type {
        AlertType::SignalEvent => given.or(Some(vec![Severity::Critical])),
        AlertType::NewCluster => given,
    }
}

struct MetadataPatch {
    severities: Option<Vec<Severity>>,
    skip_similar: Option<bool>,
    disabled: Option<bool>,
}

/// Merges the patch over the stored metadata. Severities are sorted and deduplicated; the
/// `skipSimilar` / `disabled` keys are only persisted when true (absence is the default).
fn build_metadata(
    alert_type: AlertType,
    patch: &MetadataPatch,
    stored: &Value,
    clustering_enabled: bool,
) -> Result<Value, AlertError> {
    let mut metadata = match stored {
        Value::Object(map) => map.clone(),
        _ => Map::new(),
    };
    match alert_type {
        AlertType::SignalEvent => {
            if let Some(severities) = &patch.severities {
                let levels: BTreeSet<u8> = severities.iter().map(|s| s.level()).collect();
                if levels.is_empty() {
                    return Err(AlertError::Validation(
                        "severities must list at least one of info, warning, critical".to_string(),
                    ));
                }
                metadata.insert("severities".to_string(), json!(levels));
            }
            if let Some(skip_similar) = patch.skip_similar {
                // Without clustering, skip-similar silently drops every notification.
                if skip_similar && !clustering_enabled {
                    return Err(AlertError::Validation(
                        "skipSimilar needs clustering, which isn't available on this deployment"
                            .to_string(),
                    ));
                }
                set_flag(&mut metadata, "skipSimilar", skip_similar);
            }
        }
        AlertType::NewCluster => {
            if patch.skip_similar.is_some() || patch.severities.is_some() {
                return Err(AlertError::Validation(
                    "severities and skipSimilar only apply to SIGNAL_EVENT alerts".to_string(),
                ));
            }
        }
    }
    if let Some(disabled) = patch.disabled {
        set_flag(&mut metadata, "disabled", disabled);
    }
    Ok(Value::Object(metadata))
}

fn set_flag(metadata: &mut Map<String, Value>, key: &str, value: bool) {
    if value {
        metadata.insert(key.to_string(), Value::Bool(true));
    } else {
        metadata.remove(key);
    }
}

/// Stored severities; absent means critical only, as the event pipeline reads it.
fn stored_severities(metadata: &Value) -> Vec<Severity> {
    match metadata.get("severities").and_then(Value::as_array) {
        Some(levels) => levels
            .iter()
            .filter_map(Value::as_u64)
            .filter_map(Severity::from_level)
            .collect(),
        None => vec![Severity::Critical],
    }
}

/// Filters run against the signal's extracted payload, so each column must be one of the
/// signal's output fields.
fn validate_filters(
    alert_type: AlertType,
    groups: Vec<Vec<Filter>>,
    schema: &Value,
) -> Result<Vec<Value>, AlertError> {
    if alert_type != AlertType::SignalEvent && !groups.is_empty() {
        return Err(AlertError::Validation(
            "filters only apply to SIGNAL_EVENT alerts".to_string(),
        ));
    }
    let fields: BTreeSet<&str> = schema
        .get("properties")
        .and_then(Value::as_object)
        .map(|props| props.keys().map(String::as_str).collect())
        .unwrap_or_default();

    groups
        .into_iter()
        .enumerate()
        .map(|(i, group)| {
            if group.is_empty() {
                return Err(AlertError::Validation(format!(
                    "filters[{i}] must have at least one condition"
                )));
            }
            if let Some(filter) = group.iter().find(|f| !fields.contains(f.column.as_str())) {
                return Err(AlertError::Validation(format!(
                    "filters[{i}]: column \"{}\" is not a field of the signal's output; fields: {}",
                    filter.column,
                    fields.iter().copied().collect::<Vec<_>>().join(", ")
                )));
            }
            serde_json::to_value(group).map_err(|e| AlertError::Internal(e.into()))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn patch(
        severities: Option<Vec<Severity>>,
        skip_similar: Option<bool>,
        disabled: Option<bool>,
    ) -> MetadataPatch {
        MetadataPatch {
            severities,
            skip_similar,
            disabled,
        }
    }

    #[test]
    fn severities_are_sorted_and_deduplicated() {
        let p = patch(
            Some(vec![Severity::Critical, Severity::Info, Severity::Critical]),
            None,
            None,
        );
        let m = build_metadata(AlertType::SignalEvent, &p, &Value::Null, true).unwrap();
        assert_eq!(m, json!({ "severities": [0, 2] }));
    }

    #[test]
    fn patch_keeps_stored_keys_and_clears_flags() {
        let stored = json!({ "severities": [2], "skipSimilar": true, "disabled": true });
        let p = patch(None, Some(false), Some(false));
        let m = build_metadata(AlertType::SignalEvent, &p, &stored, true).unwrap();
        assert_eq!(m, json!({ "severities": [2] }));
    }

    #[test]
    fn rejects_empty_severities() {
        let p = patch(Some(vec![]), None, None);
        assert!(build_metadata(AlertType::SignalEvent, &p, &Value::Null, true).is_err());
    }

    #[test]
    fn clustering_gates_skip_similar() {
        let p = patch(None, Some(true), None);
        assert!(build_metadata(AlertType::SignalEvent, &p, &Value::Null, false).is_err());
    }

    #[test]
    fn new_cluster_patch_works_without_clustering() {
        // The frontend creates these on every signal, so they must stay editable.
        let p = patch(None, None, Some(true));
        let m = build_metadata(AlertType::NewCluster, &p, &json!({}), false).unwrap();
        assert_eq!(m, json!({ "disabled": true }));
    }

    #[test]
    fn new_cluster_rejects_event_options() {
        let p = patch(Some(vec![Severity::Info]), None, None);
        assert!(build_metadata(AlertType::NewCluster, &p, &Value::Null, true).is_err());
    }

    #[test]
    fn create_defaults_severities_only_for_signal_event() {
        let event = patch(create_severities(AlertType::SignalEvent, None), None, None);
        let m = build_metadata(AlertType::SignalEvent, &event, &Value::Null, true).unwrap();
        assert_eq!(m, json!({ "severities": [2] }));

        // A NEW_CLUSTER create with no severities must not pick up the default and 400.
        let cluster = patch(create_severities(AlertType::NewCluster, None), None, None);
        let m = build_metadata(AlertType::NewCluster, &cluster, &Value::Null, true).unwrap();
        assert_eq!(m, json!({}));
    }

    #[test]
    fn stored_severities_default_to_critical() {
        assert_eq!(stored_severities(&json!({})), vec![Severity::Critical]);
        assert_eq!(
            stored_severities(&json!({ "severities": [0, 1] })),
            vec![Severity::Info, Severity::Warning]
        );
    }

    #[test]
    fn filter_columns_must_be_signal_fields() {
        let schema = json!({ "properties": { "category": {}, "score": {} } });
        let groups: Vec<Vec<Filter>> = serde_json::from_value(json!([
            [{ "column": "category", "operator": "eq", "value": "refund" }]
        ]))
        .unwrap();
        let stored = validate_filters(AlertType::SignalEvent, groups, &schema).unwrap();
        assert_eq!(
            stored,
            vec![json!([{ "column": "category", "operator": "eq", "value": "refund" }])]
        );

        let bad: Vec<Vec<Filter>> = serde_json::from_value(json!([
            [{ "column": "nope", "operator": "eq", "value": "x" }]
        ]))
        .unwrap();
        let err = validate_filters(AlertType::SignalEvent, bad, &schema).unwrap_err();
        assert!(err.to_string().contains("fields: category, score"));

        let empty: Vec<Vec<Filter>> = vec![vec![]];
        assert!(validate_filters(AlertType::SignalEvent, empty, &schema).is_err());
    }
}
