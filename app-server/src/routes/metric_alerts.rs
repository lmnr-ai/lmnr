use actix_web::{HttpResponse, post, web};
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

use crate::metric_alerts::{
    preview::{MAX_PREVIEW_HOURS, preview},
    rule::Rule,
};

use super::ResponseResult;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewRequest {
    /// The rule as stored in `alerts.metadata`. It does not have to be saved.
    pub rule: Value,
    /// Set for a saved rule, so the replay uses its check grid.
    pub alert_id: Option<Uuid>,
    pub hours: Option<i64>,
}

/// Replays a metric rule over recent history and reports the incidents it
/// would have opened.
#[post("metric-alerts/preview")]
pub async fn preview_metric_alert(
    req: web::Json<PreviewRequest>,
    path: web::Path<Uuid>,
    clickhouse: web::Data<clickhouse::Client>,
) -> ResponseResult {
    let project_id = path.into_inner();
    let PreviewRequest {
        rule,
        alert_id,
        hours,
    } = req.into_inner();

    let rule = match Rule::parse(&rule) {
        Ok(rule) => rule,
        Err(error) => return Ok(HttpResponse::BadRequest().json(json!({ "error": error }))),
    };
    let result = preview(
        clickhouse.get_ref(),
        &project_id,
        &rule,
        &alert_id.unwrap_or_default(),
        hours.unwrap_or(MAX_PREVIEW_HOURS),
    )
    .await?;

    Ok(HttpResponse::Ok().json(result))
}
