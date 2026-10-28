//! Dashboard and chart writes, shared by the frontend (via `routes::dashboards`), the CLI (via
//! `api::v1::cli::dashboards`) and the Laminar agent's dashboard tools. Reads stay in the
//! frontend; the agent and the CLI read through SQL.

use std::collections::{HashMap, HashSet};

use actix_web::HttpResponse;
use serde::Deserialize;
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

use crate::db::dashboards::{self as db, Dashboard, DashboardChart};
use layout::{Layout, auto_place, settle};

pub mod chart_query;
pub mod layout;

#[derive(Debug, thiserror::Error)]
pub enum DashboardError {
    #[error("{0}")]
    Validation(String),
    #[error("{0} not found")]
    NotFound(String),
    #[error("A project must have at least one dashboard")]
    LastDashboard,
    #[error(transparent)]
    Internal(#[from] anyhow::Error),
}

impl From<sqlx::Error> for DashboardError {
    fn from(e: sqlx::Error) -> Self {
        Self::Internal(e.into())
    }
}

pub fn error_response(e: DashboardError) -> HttpResponse {
    match e {
        DashboardError::Validation(m) => HttpResponse::BadRequest().json(json!({ "error": m })),
        e @ DashboardError::NotFound(_) => {
            HttpResponse::NotFound().json(json!({ "error": e.to_string() }))
        }
        e @ DashboardError::LastDashboard => {
            HttpResponse::Conflict().json(json!({ "error": e.to_string() }))
        }
        DashboardError::Internal(err) => {
            log::error!("Dashboard write failed: {err:?}");
            HttpResponse::InternalServerError().json(json!({ "error": "Internal server error" }))
        }
    }
}

/// One entry of a chart upsert. With `id` it patches that chart — omitted fields keep their
/// stored value; without `id` it creates one and `name`, `query` and `config` are required.
/// Omitting `layout` keeps an existing chart's position and auto-places a new one.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChartUpsert {
    #[serde(default)]
    pub id: Option<Uuid>,
    #[serde(default)]
    pub name: Option<String>,
    /// Replaces `queryStructure` too: a query without one is SQL-only.
    #[serde(default)]
    pub query: Option<String>,
    #[serde(default)]
    pub query_structure: Option<Value>,
    #[serde(default)]
    pub config: Option<Value>,
    #[serde(default)]
    pub layout: Option<Layout>,
}

fn validate_name(name: &str) -> Result<String, DashboardError> {
    let name = name.trim();
    if name.is_empty() {
        return Err(DashboardError::Validation("Name is required".to_string()));
    }
    Ok(name.to_string())
}

pub async fn create_dashboard(
    pool: &PgPool,
    project_id: Uuid,
    name: &str,
) -> Result<Dashboard, DashboardError> {
    let name = validate_name(name)?;
    Ok(db::insert_dashboard(pool, project_id, &name).await?)
}

pub async fn rename_dashboard(
    pool: &PgPool,
    project_id: Uuid,
    dashboard_id: Uuid,
    name: &str,
) -> Result<Dashboard, DashboardError> {
    let name = validate_name(name)?;
    db::rename_dashboard(pool, project_id, dashboard_id, &name)
        .await?
        .ok_or_else(|| DashboardError::NotFound("Dashboard".to_string()))
}

pub async fn delete_dashboard(
    pool: &PgPool,
    project_id: Uuid,
    dashboard_id: Uuid,
) -> Result<(), DashboardError> {
    let mut tx = pool.begin().await?;
    db::lock_project_dashboards(&mut tx, project_id).await?;

    if db::count_dashboards(&mut tx, project_id).await? <= 1 {
        return Err(DashboardError::LastDashboard);
    }
    if !db::delete_dashboard(&mut tx, project_id, dashboard_id).await? {
        return Err(DashboardError::NotFound("Dashboard".to_string()));
    }

    tx.commit().await?;
    Ok(())
}

/// Returns how many of `chart_ids` were on the dashboard.
pub async fn delete_charts(
    pool: &PgPool,
    project_id: Uuid,
    dashboard_id: Uuid,
    chart_ids: &[Uuid],
) -> Result<u64, DashboardError> {
    if chart_ids.is_empty() {
        return Err(DashboardError::Validation(
            "At least one chart id is required".to_string(),
        ));
    }
    Ok(db::delete_charts(pool, project_id, dashboard_id, chart_ids).await?)
}

/// Writes every entry in one transaction and returns the charts in input order.
///
/// Explicit layouts are applied exactly and must not overlap each other. Charts not given a
/// layout — the rest of the dashboard and updated entries without one — are pushed down until
/// they clear them; new charts without a layout are auto-placed last.
pub async fn upsert_charts(
    pool: &PgPool,
    project_id: Uuid,
    dashboard_id: Uuid,
    charts: Vec<ChartUpsert>,
) -> Result<Vec<DashboardChart>, DashboardError> {
    if charts.is_empty() {
        return Err(DashboardError::Validation(
            "At least one chart is required".to_string(),
        ));
    }

    let mut tx = pool.begin().await?;
    if !db::lock_dashboard(&mut tx, project_id, dashboard_id).await? {
        return Err(DashboardError::NotFound("Dashboard".to_string()));
    }

    let existing = db::get_charts(&mut tx, project_id, dashboard_id).await?;
    let existing_by_id: HashMap<Uuid, &DashboardChart> =
        existing.iter().map(|chart| (chart.id, chart)).collect();

    validate_upserts(&charts, &existing_by_id)?;
    let layouts = resolve_layouts(&charts, &existing)?;

    let batch_ids: HashSet<Uuid> = charts.iter().filter_map(|c| c.id).collect();
    for chart in &existing {
        if batch_ids.contains(&chart.id) {
            continue;
        }
        if let Some(moved) = layouts.moved.get(&chart.id) {
            db::update_chart_layout(&mut tx, project_id, dashboard_id, chart.id, &json!(moved))
                .await?;
        }
    }

    let mut written = Vec::with_capacity(charts.len());
    for (upsert, layout) in charts.into_iter().zip(layouts.entries) {
        let chart = match upsert.id {
            Some(id) => {
                let current = existing_by_id[&id];
                let settings = merge_settings(&current.settings, &upsert, layout);
                let name = upsert
                    .name
                    .as_deref()
                    .map(str::trim)
                    .unwrap_or(&current.name);
                let query = upsert.query.as_deref().unwrap_or(&current.query);
                db::update_chart(
                    &mut tx,
                    project_id,
                    dashboard_id,
                    id,
                    name,
                    query,
                    &settings,
                )
                .await?
                .ok_or_else(|| DashboardError::NotFound(format!("Chart {id}")))?
            }
            None => {
                let settings = json!({
                    "config": upsert.config,
                    "layout": layout,
                    "queryStructure": upsert.query_structure,
                });
                db::insert_chart(
                    &mut tx,
                    project_id,
                    dashboard_id,
                    upsert.name.as_deref().unwrap_or_default().trim(),
                    upsert.query.as_deref().unwrap_or_default(),
                    &settings,
                )
                .await?
            }
        };
        written.push(chart);
    }

    tx.commit().await?;
    Ok(written)
}

fn validate_upserts(
    charts: &[ChartUpsert],
    existing_by_id: &HashMap<Uuid, &DashboardChart>,
) -> Result<(), DashboardError> {
    let mut seen = HashSet::new();
    for (i, chart) in charts.iter().enumerate() {
        let invalid = |msg: &str| DashboardError::Validation(format!("charts[{i}]: {msg}"));
        match chart.id {
            Some(id) => {
                if !seen.insert(id) {
                    return Err(invalid("chart id appears more than once in the batch"));
                }
                if !existing_by_id.contains_key(&id) {
                    return Err(DashboardError::NotFound(format!(
                        "Chart {id} on this dashboard"
                    )));
                }
            }
            None => {
                if chart.name.is_none() || chart.query.is_none() || chart.config.is_none() {
                    return Err(invalid("a new chart needs name, query and config"));
                }
            }
        }
        if chart.name.as_deref().is_some_and(|n| n.trim().is_empty()) {
            return Err(invalid("name must not be blank"));
        }
        if chart.query_structure.is_some() && chart.query.is_none() {
            return Err(invalid(
                "queryStructure must come with the query it generates",
            ));
        }
        if let Some(layout) = &chart.layout {
            layout
                .validate()
                .map_err(|e| invalid(&format!("layout: {e}")))?;
        }
    }
    Ok(())
}

struct ResolvedLayouts {
    /// Final layout of each upsert entry, in input order.
    entries: Vec<Layout>,
    /// New layouts of existing charts that had to move.
    moved: HashMap<Uuid, Layout>,
}

fn stored_layout(settings: &Value) -> Option<Layout> {
    serde_json::from_value(settings.get("layout")?.clone()).ok()
}

fn resolve_layouts(
    charts: &[ChartUpsert],
    existing: &[DashboardChart],
) -> Result<ResolvedLayouts, DashboardError> {
    let explicit: Vec<(usize, Layout)> = charts
        .iter()
        .enumerate()
        .filter_map(|(i, c)| c.layout.map(|layout| (i, layout)))
        .collect();
    for (n, (i, a)) in explicit.iter().enumerate() {
        if let Some((j, _)) = explicit[n + 1..].iter().find(|(_, b)| a.overlaps(b)) {
            return Err(DashboardError::Validation(format!(
                "charts[{i}] and charts[{j}] have overlapping layouts"
            )));
        }
    }

    let explicit_ids: HashSet<Uuid> = charts
        .iter()
        .filter(|c| c.layout.is_some())
        .filter_map(|c| c.id)
        .collect();
    let others: Vec<(Uuid, Layout)> = existing
        .iter()
        .filter(|chart| !explicit_ids.contains(&chart.id))
        .filter_map(|chart| Some((chart.id, stored_layout(&chart.settings)?)))
        .collect();
    let original: HashMap<Uuid, Layout> = others.iter().copied().collect();

    let fixed: Vec<Layout> = explicit.iter().map(|(_, layout)| *layout).collect();
    let settled: HashMap<Uuid, Layout> = settle(&fixed, others).into_iter().collect();

    let mut placed: Vec<Layout> = fixed.into_iter().chain(settled.values().copied()).collect();
    let entries = charts
        .iter()
        .map(|chart| {
            let kept = chart.layout.or_else(|| settled.get(&chart.id?).copied());
            kept.unwrap_or_else(|| {
                let layout = auto_place(&placed);
                placed.push(layout);
                layout
            })
        })
        .collect();

    let moved = settled
        .into_iter()
        .filter(|(id, layout)| original.get(id) != Some(layout))
        .collect();

    Ok(ResolvedLayouts { entries, moved })
}

/// Patches the stored settings so fields the upsert leaves out survive.
fn merge_settings(current: &Value, upsert: &ChartUpsert, layout: Layout) -> Value {
    let mut settings = match current {
        Value::Object(map) => map.clone(),
        _ => serde_json::Map::new(),
    };
    settings.insert("layout".to_string(), json!(layout));
    if let Some(config) = &upsert.config {
        settings.insert("config".to_string(), config.clone());
    }
    if upsert.query.is_some() {
        settings.insert(
            "queryStructure".to_string(),
            upsert.query_structure.clone().unwrap_or(Value::Null),
        );
    }
    Value::Object(settings)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;

    fn chart(id: Uuid, layout: Layout) -> DashboardChart {
        DashboardChart {
            id,
            project_id: Uuid::nil(),
            dashboard_id: Uuid::nil(),
            name: "c".to_string(),
            query: "SELECT 1".to_string(),
            settings: json!({ "config": { "type": "line" }, "layout": layout }),
            created_at: Utc::now(),
        }
    }

    fn upsert(id: Option<Uuid>, layout: Option<Layout>) -> ChartUpsert {
        ChartUpsert {
            id,
            name: Some("n".to_string()),
            query: Some("SELECT 1".to_string()),
            query_structure: None,
            config: Some(json!({ "type": "line" })),
            layout,
        }
    }

    fn l(x: i64, y: i64, w: i64, h: i64) -> Layout {
        Layout { x, y, w, h }
    }

    #[test]
    fn explicit_layouts_must_not_overlap() {
        let charts = [
            upsert(None, Some(l(0, 0, 6, 4))),
            upsert(None, Some(l(3, 2, 6, 4))),
        ];
        let err = resolve_layouts(&charts, &[]).err().unwrap();
        assert!(err.to_string().contains("charts[0] and charts[1]"));
    }

    #[test]
    fn untouched_charts_are_pushed_below_explicit_ones() {
        let other = Uuid::new_v4();
        let existing = [chart(other, l(0, 0, 4, 6))];
        let resolved = resolve_layouts(&[upsert(None, Some(l(0, 0, 12, 4)))], &existing).unwrap();
        assert_eq!(resolved.entries, vec![l(0, 0, 12, 4)]);
        assert_eq!(resolved.moved.get(&other), Some(&l(0, 4, 4, 6)));
    }

    #[test]
    fn full_reset_moves_nothing_else() {
        let (a, b) = (Uuid::new_v4(), Uuid::new_v4());
        let existing = [chart(a, l(0, 0, 4, 6)), chart(b, l(4, 0, 4, 6))];
        let charts = [
            upsert(Some(a), Some(l(0, 0, 12, 4))),
            upsert(Some(b), Some(l(0, 4, 12, 4))),
        ];
        let resolved = resolve_layouts(&charts, &existing).unwrap();
        assert_eq!(resolved.entries, vec![l(0, 0, 12, 4), l(0, 4, 12, 4)]);
        assert!(resolved.moved.is_empty());
    }

    #[test]
    fn update_without_layout_keeps_position() {
        let a = Uuid::new_v4();
        let existing = [chart(a, l(4, 2, 4, 6))];
        let resolved = resolve_layouts(&[upsert(Some(a), None)], &existing).unwrap();
        assert_eq!(resolved.entries, vec![l(4, 2, 4, 6)]);
    }

    #[test]
    fn new_charts_without_layout_are_auto_placed_around_everything() {
        let a = Uuid::new_v4();
        let existing = [chart(a, l(0, 0, 4, 6))];
        let charts = [
            upsert(None, None),
            upsert(None, Some(l(4, 0, 4, 3))),
            upsert(None, None),
        ];
        let resolved = resolve_layouts(&charts, &existing).unwrap();
        assert_eq!(resolved.entries[0], l(8, 0, 4, 6));
        assert_eq!(resolved.entries[2], l(4, 3, 4, 6));
    }

    #[test]
    fn merge_keeps_unspecified_settings() {
        let current = json!({
            "config": { "type": "bar" },
            "layout": l(0, 0, 4, 6),
            "queryStructure": { "table": "spans" },
        });
        let rename = ChartUpsert {
            id: Some(Uuid::nil()),
            name: Some("renamed".to_string()),
            query: None,
            query_structure: None,
            config: None,
            layout: None,
        };
        let merged = merge_settings(&current, &rename, l(0, 6, 4, 6));
        assert_eq!(merged["config"], json!({ "type": "bar" }));
        assert_eq!(merged["queryStructure"], json!({ "table": "spans" }));
        assert_eq!(merged["layout"], json!(l(0, 6, 4, 6)));
    }
}
