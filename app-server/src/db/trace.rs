use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{FromRow, PgPool, Postgres, QueryBuilder};
use uuid::Uuid;

use crate::{
    db::{modifiers::DateRange, spans::SpanType},
    traces::attributes::TraceAttributes,
};

use super::{
    modifiers::{Filter, FilterOperator},
    utils::add_date_range_to_query,
};

pub const DEFAULT_VERSION: &str = "0.1.0";

/// Helper struct to pass current trace info, if exists, if pipeline is called from remote trace context
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CurrentTraceAndSpan {
    pub trace_id: Uuid,
    pub parent_span_id: Uuid,
    // Optional for backwards compatibility
    #[serde(default)]
    pub parent_span_path: Option<String>,
}

#[derive(sqlx::Type, Deserialize, Serialize, PartialEq, Clone, Debug, Default)]
#[sqlx(type_name = "trace_type")]
pub enum TraceType {
    #[default]
    DEFAULT,
    EVENT,
    EVALUATION,
}

fn default_true() -> bool {
    true
}

#[derive(Deserialize, Serialize, sqlx::FromRow, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Trace {
    pub id: Uuid,
    #[serde(default)]
    start_time: Option<DateTime<Utc>>,
    #[serde(default)]
    end_time: Option<DateTime<Utc>>,
    // Laminar trace format's version
    version: String,
    // Laminar customers' release version
    release: Option<String>,
    // User id of Laminar customers' user
    user_id: Option<String>,
    session_id: Option<String>,
    metadata: Option<Value>,
    #[serde(default)]
    total_token_count: i64,
    #[serde(default)]
    cost: f64,
    #[serde(default = "default_true")]
    success: bool,
    // Project id is default because it's added later based on the ProjectApiKey
    #[serde(default)]
    pub project_id: Uuid,
}

#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct TraceWithParentSpanAndEvents {
    id: Uuid,
    start_time: DateTime<Utc>,
    end_time: Option<DateTime<Utc>>,
    // Laminar trace format's version
    version: String,
    // Laminar customers' release version
    release: Option<String>,
    // User id of Laminar customers' user
    user_id: Option<String>,
    session_id: Option<String>,
    metadata: Option<Value>,
    total_token_count: i64,
    cost: f64,
    success: bool,
    project_id: Uuid,

    parent_span_input: Option<Value>,
    parent_span_output: Option<Value>,
    parent_span_name: Option<String>,
    parent_span_type: Option<SpanType>,

    // 'events' is a list of partial event objects, using Option because of Coalesce
    events: Option<Value>,
}

#[derive(FromRow, Debug)]
struct TotalCount {
    total_count: i64,
}

pub async fn update_trace_attributes(
    pool: &PgPool,
    project_id: &Uuid,
    attributes: &TraceAttributes,
) -> Result<()> {
    sqlx::query(
        "
        INSERT INTO traces (
            id,
            project_id,
            total_token_count,
            cost,
            success,
            start_time,
            end_time,
            version,
            session_id,
            user_id,
            trace_type
        )
        VALUES (
            $1,
            $2,
            COALESCE($3, 0::int8),
            COALESCE($4, 0::float8),
            COALESCE($5, true),
            $6,
            $7,
            $8,
            $9,
            $10,
            COALESCE($11, 'DEFAULT'::trace_type)
        )
        ON CONFLICT(id) DO
        UPDATE
        SET 
            total_token_count = traces.total_token_count + COALESCE($3, 0),
            cost = traces.cost + COALESCE($4, 0),
            success = CASE WHEN $5 IS NULL THEN traces.success ELSE $5 END,
            start_time = CASE WHEN traces.start_time IS NULL OR traces.start_time > $6 THEN $6 ELSE traces.start_time END,
            end_time = CASE WHEN traces.end_time IS NULL OR traces.end_time < $7 THEN $7 ELSE traces.end_time END,
            session_id = CASE WHEN traces.session_id IS NULL THEN $9 ELSE traces.session_id END,
            user_id = CASE WHEN traces.user_id IS NULL THEN $10 ELSE traces.user_id END,
            trace_type = CASE WHEN $11 IS NULL THEN traces.trace_type ELSE COALESCE($11, 'DEFAULT'::trace_type) END
        "
    )
    .bind(attributes.id)
    .bind(project_id)
    .bind(attributes.total_token_count)
    .bind(attributes.cost)
    .bind(attributes.success)
    .bind(attributes.start_time)
    .bind(attributes.end_time)
    .bind(DEFAULT_VERSION)
    .bind(&attributes.session_id)
    .bind(&attributes.user_id)
    .bind(&attributes.trace_type)
    .execute(pool)
    .await?;
    Ok(())
}

pub fn add_traces_info_expression(
    query: &mut QueryBuilder<Postgres>,
    date_range: &Option<DateRange>,
    project_id: Uuid,
) -> Result<()> {
    query.push(
        "
    traces_info AS (
        SELECT
            id,
            start_time,
            end_time,
            version,
            release,
            user_id,
            session_id,
            metadata,
            project_id,
            total_token_count,
            cost,
            success,
            trace_type,
            trace_spans.input parent_span_input,
            trace_spans.output parent_span_output,
            trace_spans.attributes parent_span_attributes,
            trace_spans.name parent_span_name,
            trace_spans.span_type parent_span_type,
            EXTRACT(EPOCH FROM (end_time - start_time)) as latency,
            CASE WHEN success = true THEN 'Success' ELSE 'Failed' END status
        FROM traces
        JOIN (
            SELECT input, output, attributes, name, span_type, trace_id
            FROM spans
            WHERE parent_span_id IS NULL
            ",
    );
    add_date_range_to_query(
        query,
        date_range,
        "spans.start_time",
        Some("spans.end_time"),
    )?;

    query
        .push(
            "
        ) trace_spans ON traces.id = trace_spans.trace_id
        WHERE traces.project_id = ",
        )
        .push_bind(project_id)
        .push(" AND traces.start_time IS NOT NULL AND traces.end_time IS NOT NULL");

    add_date_range_to_query(
        query,
        date_range,
        "traces.start_time",
        Some("traces.end_time"),
    )?;

    query.push(")");

    Ok(())
}

fn add_matching_spans_query(
    query: &mut QueryBuilder<Postgres>,
    date_range: &Option<DateRange>,
    text_search_filter: Option<String>,
) -> Result<()> {
    query.push(
        "
        matching_spans_trace_ids AS (
            SELECT DISTINCT trace_id
            FROM spans
            WHERE 1=1
            ",
    );

    add_date_range_to_query(query, date_range, "start_time", Some("end_time"))?;

    if let Some(text_search_filter) = text_search_filter {
        query
            .push(" AND (input::TEXT ILIKE ")
            .push_bind(format!("%{text_search_filter}%"))
            .push(" OR output::TEXT ILIKE ")
            .push_bind(format!("%{text_search_filter}%"))
            .push(" OR name::TEXT ILIKE ")
            .push_bind(format!("%{text_search_filter}%"))
            .push(" OR attributes::TEXT ILIKE ")
            .push_bind(format!("%{text_search_filter}%"))
            .push(")");
    };

    query.push(")");
    Ok(())
}

const TRACE_EVENTS_EXPRESSION: &str = "
    trace_events AS (
        SELECT
            traces.id as trace_id,
            jsonb_agg(
                jsonb_build_object(
                    'id', events.id,
                    'typeId', events.template_id,
                    'templateName', event_templates.name,
                    'spanId', events.span_id
                )
            ) as events
        FROM events
        JOIN event_templates ON events.template_id = event_templates.id
        JOIN spans ON spans.span_id = events.span_id
        JOIN traces ON traces.id = spans.trace_id
        WHERE traces.start_time IS NOT NULL AND traces.end_time IS NOT NULL
        GROUP BY traces.id
    )";

fn add_filters_to_traces_query(query: &mut QueryBuilder<Postgres>, filters: &Option<Vec<Filter>>) {
    if let Some(filters) = filters {
        filters.iter().for_each(|filter| {
            let filter_value_str = match &filter.filter_value {
                Value::String(s) => s.clone(),
                v => v.to_string(),
            };
            if !filter.validate_column() {
                log::warn!("Invalid column name: {}", filter.filter_column);
                return;
            }
            if filter.filter_column.starts_with("event.") {
                let template_name = filter.filter_column.strip_prefix("event.").unwrap();
                filter_by_event_value(
                    query,
                    template_name.to_string(),
                    filter.filter_operator.clone(),
                    filter.filter_value.clone(),
                );
                return;
            }
            if filter.filter_column.starts_with("label.") {
                let label_name = filter.filter_column.strip_prefix("label.").unwrap();
                filter_by_span_label_value(
                    query,
                    label_name.to_string(),
                    filter.filter_operator.clone(),
                    filter.filter_value.clone(),
                );
                return;
            }
            query.push(" AND ");
            query.push(&filter.filter_column);
            query.push(filter.filter_operator.to_sql_operator());
            if ["id"]
                .iter()
                .any(|col| col == &filter.filter_column.as_str())
            {
                query.push_bind(Uuid::parse_str(&filter_value_str).unwrap_or_default());
            } else if ["latency", "cost", "total_token_count"]
                .iter()
                .any(|col| col == &filter.filter_column.as_str())
            {
                query.push_bind(filter_value_str.parse::<f64>().unwrap_or_default());
            } else if filter.filter_column == "trace_type" {
                query.push_bind(filter_value_str);
                query.push("::trace_type");
            } else {
                query.push_bind(filter_value_str);
            }
        });
    }
}

fn filter_by_event_value(
    query: &mut QueryBuilder<Postgres>,
    template_name: String,
    filter_operator: FilterOperator,
    event_value: Value,
) {
    query.push(
        " AND id IN
        (SELECT trace_id
        FROM spans
        JOIN events ON spans.span_id = events.span_id
        JOIN event_templates ON events.template_id = event_templates.id
        WHERE event_templates.name = 
    ",
    );
    query.push_bind(template_name);
    query.push(" AND events.value ");
    query.push(filter_operator.to_sql_operator());
    query.push_bind(event_value);
    query.push("::jsonb)");
}

fn filter_by_span_label_value(
    query: &mut QueryBuilder<Postgres>,
    label_name: String,
    filter_operator: FilterOperator,
    label_value: Value,
) {
    query.push(
        " AND id IN
        (SELECT trace_id
        FROM spans
        JOIN labels ON spans.span_id = labels.span_id
        JOIN label_classes ON labels.class_id = label_classes.id
        WHERE label_classes.name = ",
    );
    query.push_bind(label_name);
    query.push(" AND label_classes.value_map ->> labels.value::int4 ");
    query.push(filter_operator.to_sql_operator());
    query.push_bind(label_value);
    query.push("::text)");
}

/// Queries traces for a project which match the given filters, with given limit and offset
pub async fn get_traces(
    pool: &PgPool,
    project_id: Uuid,
    limit: usize,
    offset: usize,
    filters: &Option<Vec<Filter>>,
    date_range: &Option<DateRange>,
    text_search_filter: Option<String>,
) -> Result<Vec<TraceWithParentSpanAndEvents>> {
    let mut query = QueryBuilder::<Postgres>::new("WITH ");
    add_traces_info_expression(&mut query, date_range, project_id)?;
    query.push(", ");
    add_matching_spans_query(&mut query, date_range, text_search_filter)?;
    query.push(", ");
    query.push(TRACE_EVENTS_EXPRESSION);

    query.push(
        "
        SELECT
            id,
            start_time,
            end_time,
            version,
            release,
            user_id,
            session_id,
            metadata,
            project_id,
            total_token_count,
            cost,
            success,
            COALESCE(trace_events.events, '[]'::jsonb) AS events,
            parent_span_input,
            parent_span_output,
            parent_span_name,
            parent_span_type,
            status
        FROM traces_info
        JOIN matching_spans_trace_ids ON traces_info.id = matching_spans_trace_ids.trace_id
        LEFT JOIN trace_events ON trace_events.trace_id = traces_info.id
        WHERE project_id = ",
    );
    query.push_bind(project_id);

    add_filters_to_traces_query(&mut query, &filters);

    query
        .push(" ORDER BY start_time DESC OFFSET ")
        .push_bind(offset as i64)
        .push(" LIMIT ")
        .push_bind(limit as i64);

    let traces = query
        .build_query_as::<'_, TraceWithParentSpanAndEvents>()
        .fetch_all(pool)
        .await?;

    Ok(traces)
}

/// Returns the total count of traces matching the given filters
pub async fn count_traces(
    pool: &PgPool,
    project_id: Uuid,
    filters: &Option<Vec<Filter>>,
    date_range: &Option<DateRange>,
    text_search_filter: Option<String>,
) -> Result<i64> {
    let mut query = QueryBuilder::<Postgres>::new("WITH ");
    add_traces_info_expression(&mut query, date_range, project_id)?;
    query.push(", ");
    add_matching_spans_query(&mut query, date_range, text_search_filter)?;
    query.push(", ");
    query.push(TRACE_EVENTS_EXPRESSION);
    query.push(
        "
        SELECT
            COUNT(DISTINCT(id)) as total_count
        FROM traces_info
        JOIN matching_spans_trace_ids ON traces_info.id = matching_spans_trace_ids.trace_id
        LEFT JOIN trace_events ON trace_events.trace_id = traces_info.id
        WHERE project_id = ",
    );
    query.push_bind(project_id);

    add_filters_to_traces_query(&mut query, &filters);

    let count = query
        .build_query_as::<'_, TotalCount>()
        .fetch_one(pool)
        .await?
        .total_count;

    Ok(count)
}

/// `count_traces` with filters adds a lot of information to the query and joins on the events (in order to filter)
/// This function is a simpler version of `count_traces` that only counts the traces without any additional information
/// and is more efficient.
pub async fn count_all_traces_in_project(pool: &PgPool, project_id: Uuid) -> Result<i64> {
    let count = sqlx::query_as::<_, TotalCount>(
        "SELECT COUNT(*) as total_count
        FROM traces
        WHERE project_id = $1",
    )
    .bind(project_id)
    .fetch_one(pool)
    .await?;

    Ok(count.total_count)
}

pub async fn get_single_trace(pool: &PgPool, id: Uuid) -> Result<Trace> {
    let trace = sqlx::query_as::<_, Trace>(
        "SELECT
            id,
            start_time,
            end_time,
            version,
            release,
            user_id,
            session_id,
            metadata,
            project_id,
            total_token_count,
            cost,
            success
        FROM traces
        WHERE id = $1
        AND start_time IS NOT NULL AND end_time IS NOT NULL",
    )
    .bind(id)
    .fetch_one(pool)
    .await?;

    Ok(trace)
}

#[derive(Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub total_token_count: i64,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub duration: f64,
    pub cost: f64,
    pub trace_count: i64,
}

pub async fn get_sessions(
    pool: &PgPool,
    project_id: Uuid,
    limit: usize,
    offset: usize,
    filters: &Option<Vec<Filter>>,
    date_range: &Option<DateRange>,
) -> Result<Vec<Session>> {
    let mut query = sqlx::QueryBuilder::new(
        "SELECT
            session_id as id,
            count(id)::int8 as trace_count,
            sum(total_token_count)::int8 as total_token_count,
            min(start_time) as start_time,
            max(end_time) as end_time,
            sum(extract(epoch from (end_time - start_time)))::float8 as duration,
            sum(cost)::float8 as cost
            FROM traces
            WHERE session_id is not null and project_id = ",
    );
    query.push_bind(project_id);

    add_date_range_to_query(&mut query, date_range, "start_time", Some("end_time"))?;

    add_filters_to_traces_query(&mut query, filters);

    query
        .push(" GROUP BY session_id ORDER BY start_time DESC")
        .push(" OFFSET ")
        .push_bind(offset as i64)
        .push(" LIMIT ")
        .push_bind(limit as i64);

    let sessions = query.build_query_as::<Session>().fetch_all(pool).await?;

    Ok(sessions)
}

pub async fn count_sessions(
    pool: &PgPool,
    project_id: Uuid,
    filters: &Option<Vec<Filter>>,
    date_range: &Option<DateRange>,
) -> Result<i64> {
    let mut query = sqlx::QueryBuilder::new(
        "SELECT
            count(DISTINCT session_id) as total_count
            FROM traces
            WHERE session_id is not null and project_id = ",
    );

    query.push_bind(project_id);

    add_date_range_to_query(&mut query, date_range, "start_time", Some("end_time"))?;

    add_filters_to_traces_query(&mut query, filters);

    let count = query
        .build_query_as::<'_, TotalCount>()
        .fetch_optional(pool)
        .await?;

    Ok(count.map(|tc| tc.total_count).unwrap_or_default())
}

pub async fn count_all_sessions_in_project(pool: &PgPool, project_id: Uuid) -> Result<i64> {
    let count = sqlx::query_as::<_, TotalCount>(
        "SELECT
            count(DISTINCT session_id) as total_count
            FROM traces
            WHERE session_id is not null AND project_id = $1",
    )
    .bind(project_id)
    .fetch_one(pool)
    .await?;

    Ok(count.total_count)
}
