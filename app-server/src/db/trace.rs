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

#[derive(Serialize, sqlx::FromRow, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Trace {
    id: Uuid,
    #[serde(default)]
    start_time: Option<DateTime<Utc>>,
    #[serde(default)]
    end_time: Option<DateTime<Utc>>,
    session_id: Option<String>,
    metadata: Option<Value>,
    input_token_count: i64,
    output_token_count: i64,
    total_token_count: i64,
    input_cost: f64,
    output_cost: f64,
    cost: f64,
    project_id: Uuid,
}

#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct TraceWithTopSpan {
    id: Uuid,
    start_time: DateTime<Utc>,
    end_time: Option<DateTime<Utc>>,
    session_id: Option<String>,
    metadata: Option<Value>,
    input_token_count: i64,
    output_token_count: i64,
    total_token_count: i64,
    input_cost: f64,
    output_cost: f64,
    cost: f64,
    project_id: Uuid,

    top_span_input_preview: Option<String>,
    top_span_output_preview: Option<String>,
    top_span_name: Option<String>,
    top_span_type: Option<SpanType>,
    top_span_path: Option<String>,
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
            input_token_count,
            output_token_count,
            total_token_count,
            input_cost,
            output_cost,
            cost,
            start_time,
            end_time,
            session_id,
            trace_type,
            metadata
        )
        VALUES (
            $1,
            $2,
            COALESCE($3, 0::int8),
            COALESCE($4, 0::int8),
            COALESCE($5, 0::int8),
            COALESCE($6, 0::float8),
            COALESCE($7, 0::float8),
            COALESCE($8, 0::float8),
            $9,
            $10,
            $11,
            COALESCE($12, 'DEFAULT'::trace_type),
            $13
        )
        ON CONFLICT(id) DO
        UPDATE
        SET
            input_token_count = traces.input_token_count + COALESCE($3, 0),
            output_token_count = traces.output_token_count + COALESCE($4, 0),
            total_token_count = traces.total_token_count + COALESCE($5, 0),
            input_cost = traces.input_cost + COALESCE($6, 0),
            output_cost = traces.output_cost + COALESCE($7, 0),
            cost = traces.cost + COALESCE($8, 0),
            start_time = CASE WHEN traces.start_time IS NULL OR traces.start_time > $9 THEN $9 ELSE traces.start_time END,
            end_time = CASE WHEN traces.end_time IS NULL OR traces.end_time < $10 THEN $10 ELSE traces.end_time END,
            session_id = CASE WHEN traces.session_id IS NULL THEN $11 ELSE traces.session_id END,
            trace_type = CASE WHEN $12 IS NULL THEN traces.trace_type ELSE COALESCE($12, 'DEFAULT'::trace_type) END,
            metadata = COALESCE($13, traces.metadata)
        "
    )
    .bind(attributes.id)
    .bind(project_id)
    .bind(attributes.input_token_count)
    .bind(attributes.output_token_count)
    .bind(attributes.total_token_count)
    .bind(attributes.input_cost)
    .bind(attributes.output_cost)
    .bind(attributes.cost)
    .bind(attributes.start_time)
    .bind(attributes.end_time)
    .bind(&attributes.session_id)
    .bind(&attributes.trace_type)
    .bind(&serde_json::to_value(&attributes.metadata).unwrap())
    .execute(pool)
    .await?;
    Ok(())
}

fn add_traces_info_expression(
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
            session_id,
            metadata,
            project_id,
            input_token_count,
            output_token_count,
            total_token_count,
            input_cost,
            output_cost,
            cost,
            trace_type,
            top_level_spans.input_preview top_span_input_preview,
            top_level_spans.output_preview top_span_output_preview,
            top_level_spans.path top_span_path,
            top_level_spans.name top_span_name,
            top_level_spans.span_type top_span_type,
            EXTRACT(EPOCH FROM (end_time - start_time)) as latency
        FROM traces
        JOIN (
            SELECT
                input_preview,
                output_preview,
                attributes ->> 'lmnr.span.path' path,
                name,
                span_type,
                trace_id
            FROM spans
            WHERE parent_span_id IS NULL
            AND project_id = 
            ",
    );
    query.push_bind(project_id);
    add_date_range_to_query(
        query,
        date_range,
        "spans.start_time",
        Some("spans.end_time"),
    )?;

    query
        .push(
            "
        ) top_level_spans ON traces.id = top_level_spans.trace_id
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

fn add_text_join(
    query: &mut QueryBuilder<Postgres>,
    date_range: &Option<DateRange>,
    text_search_filter: &String,
) -> Result<()> {
    query.push(
        "
        JOIN (
            SELECT DISTINCT trace_id
            FROM spans 
            WHERE ",
    );
    query
        .push("(input::TEXT ILIKE ")
        .push_bind(format!("%{text_search_filter}%"))
        .push(" OR output::TEXT ILIKE ")
        .push_bind(format!("%{text_search_filter}%"))
        .push(" OR name::TEXT ILIKE ")
        .push_bind(format!("%{text_search_filter}%"))
        .push(" OR attributes::TEXT ILIKE ")
        .push_bind(format!("%{text_search_filter}%"))
        .push(")");

    add_date_range_to_query(query, date_range, "start_time", Some("end_time"))?;

    query.push(") matching_spans ON traces_info.id = matching_spans.trace_id");
    Ok(())
}

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
                let template_name = filter
                    .filter_column
                    .strip_prefix("event.")
                    .unwrap()
                    .to_string();
                filter_by_event_value(
                    query,
                    template_name,
                    filter.filter_operator.clone(),
                    filter.filter_value.clone(),
                );
                return;
            }
            if filter.filter_column == "labels" {
                if !filter_value_str.contains("=") || filter.filter_operator != FilterOperator::Eq {
                    log::warn!(
                        "Invalid label filter: {}. Operator must be `eq`",
                        filter_value_str
                    );
                    return;
                }
                let mut split = filter_value_str.splitn(2, '=');
                let label_name = split.next().unwrap_or_default().to_string();
                let label_value = split.next().unwrap_or_default().to_string();
                filter_by_span_label_value(
                    query,
                    label_name,
                    filter.filter_operator.clone(),
                    label_value,
                );
                return;
            }
            if filter.filter_column == "metadata" {
                if !filter_value_str.contains("=") || filter.filter_operator != FilterOperator::Eq {
                    log::warn!(
                        "Invalid metadata filter: {}. Operator must be `eq`",
                        filter_value_str
                    );
                    return;
                }
                let mut split = filter_value_str.splitn(2, '=');
                let key = split.next().unwrap_or_default();
                let value = split.next().unwrap_or_default();
                let value_json = serde_json::json!({ key: value });
                query.push(" AND metadata @> ");
                query.push_bind(value_json);
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
            } else if [
                "latency",
                "cost",
                "total_token_count",
                "input_token_count",
                "output_token_count",
                "input_cost",
                "output_cost",
            ]
            .iter()
            .any(|col| col == &filter.filter_column.as_str())
            {
                query.push_bind(filter_value_str.parse::<f64>().unwrap_or_default());
            } else if filter.filter_column == "trace_type" {
                query.push_bind(filter_value_str);
                query.push("::trace_type");
            } else if filter.filter_column == "top_span_type" {
                let span_type = filter_value_str.parse::<SpanType>().unwrap_or_default();
                query.push_bind(span_type);
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
        JOIN old_events ON spans.span_id = old_events.span_id
        JOIN event_templates ON old_events.template_id = event_templates.id
        WHERE event_templates.name = 
    ",
    );
    query.push_bind(template_name);
    query.push(" AND old_events.value ");
    query.push(filter_operator.to_sql_operator());
    query.push_bind(event_value);
    query.push("::jsonb)");
}

fn filter_by_span_label_value(
    query: &mut QueryBuilder<Postgres>,
    label_name: String,
    filter_operator: FilterOperator,
    label_value: String,
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
    query.push(" AND labels.value ");
    query.push(filter_operator.to_sql_operator());
    query.push("(label_classes.value_map ->> ");
    query.push_bind(label_value);
    query.push(")::float8)");
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
) -> Result<Vec<TraceWithTopSpan>> {
    let mut query = QueryBuilder::<Postgres>::new("WITH ");
    add_traces_info_expression(&mut query, date_range, project_id)?;

    query.push(
        "
        SELECT
            DISTINCT ON (start_time, id)
            id,
            start_time,
            end_time,
            session_id,
            metadata,
            project_id,
            input_token_count,
            output_token_count,
            total_token_count,
            input_cost,
            output_cost,
            cost,
            top_span_input_preview,
            top_span_output_preview,
            top_span_name,
            top_span_type,
            top_span_path
        FROM traces_info ",
    );
    if let Some(search) = text_search_filter {
        add_text_join(&mut query, date_range, &search)?;
    }
    query.push(" WHERE project_id = ");
    query.push_bind(project_id);

    add_filters_to_traces_query(&mut query, &filters);

    query
        .push(" ORDER BY start_time DESC, id OFFSET ")
        .push_bind(offset as i64)
        .push(" LIMIT ")
        .push_bind(limit as i64);

    let traces = query
        .build_query_as::<'_, TraceWithTopSpan>()
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
    let mut query = QueryBuilder::<Postgres>::new(
        "WITH traces_info AS (
    SELECT
        id,
        start_time,
        end_time,
        session_id,
        metadata,
        project_id,
        input_token_count,
        output_token_count,
        total_token_count,
        input_cost,
        output_cost,
        cost,
        trace_type,
        EXTRACT(EPOCH FROM (end_time - start_time)) as latency
    FROM traces
    WHERE start_time IS NOT NULL AND end_time IS NOT NULL AND trace_type = 'DEFAULT')",
    );
    query.push(
        "
        SELECT
            COUNT(DISTINCT(id)) as total_count
        FROM traces_info
        ",
    );
    if let Some(search) = text_search_filter {
        add_text_join(&mut query, date_range, &search)?;
    }
    query.push(" WHERE project_id = ");
    query.push_bind(project_id);
    add_date_range_to_query(&mut query, date_range, "start_time", Some("end_time"))?;

    add_filters_to_traces_query(&mut query, &filters);

    let count = query
        .build_query_as::<'_, TotalCount>()
        .fetch_one(pool)
        .await?
        .total_count;

    Ok(count)
}

pub async fn get_single_trace(pool: &PgPool, id: Uuid) -> Result<Trace> {
    let trace = sqlx::query_as::<_, Trace>(
        "SELECT
            id,
            start_time,
            end_time,
            session_id,
            metadata,
            project_id,
            input_token_count,
            output_token_count,
            total_token_count,
            input_cost,
            output_cost,
            cost
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
    pub input_token_count: i64,
    pub output_token_count: i64,
    pub total_token_count: i64,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub duration: f64,
    pub input_cost: f64,
    pub output_cost: f64,
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
            sum(input_token_count)::int8 as input_token_count,
            sum(output_token_count)::int8 as output_token_count,
            sum(total_token_count)::int8 as total_token_count,
            min(start_time) as start_time,
            max(end_time) as end_time,
            sum(extract(epoch from (end_time - start_time)))::float8 as duration,
            sum(input_cost)::float8 as input_cost,
            sum(output_cost)::float8 as output_cost,
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
