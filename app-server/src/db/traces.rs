use std::{collections::{HashMap, HashSet}, str::FromStr};

use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{PgPool, QueryBuilder};
use uuid::Uuid;

use crate::{
    ch::traces::search_spans_for_trace_ids, 
    db::{
        filters::{deserialize_filters, validate_and_convert_filters, FieldConfig, FieldType, Filter, FilterOperator, FilterValue}, 
        trace::TraceType
    }, 
    routes::error::Error
};

#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct TraceInfo {
    pub id: Uuid,
    pub start_time: DateTime<Utc>,
    pub end_time: Option<DateTime<Utc>>,
    pub session_id: Option<String>,
    pub input_token_count: i64,
    pub output_token_count: i64,
    pub total_token_count: i64,
    pub input_cost: f64,
    pub output_cost: f64,
    pub cost: f64,
    pub trace_type: TraceType,
    pub status: Option<String>,
    pub latency: f64,
    pub metadata: Option<Value>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchTracesParams {
    page_size: Option<i32>,
    page_number: Option<i32>,
    search: Option<String>,
    search_in: Option<String>,
    start_time: Option<DateTime<Utc>>,
    end_time: Option<DateTime<Utc>>,
    #[serde(default, deserialize_with = "deserialize_filters")]
    filters: Vec<Filter>,
}

impl SearchTracesParams {
    const MAX_TIME_RANGE_DAYS: i64 = 30;
    const MAX_PAGE_SIZE: i32 = 50;

    pub fn page_size(&self) -> i32 {
        self.page_size.unwrap_or(25)
    }
    
    pub fn page_number(&self) -> i32 {
        self.page_number.unwrap_or(0)
    }
    
    pub fn offset(&self) -> i32 {
        self.page_number() * self.page_size()
    }

    pub fn start_time(&self) -> DateTime<Utc> {
        self.start_time.unwrap_or_else(|| Utc::now() - Duration::hours(24))
    }
    
    pub fn end_time(&self) -> DateTime<Utc> {
        self.end_time.unwrap_or_else(|| Utc::now())
    }
    
    pub fn search_in(&self) -> Vec<String> {
        let parsed = self.search_in
            .as_ref()
            .map(|s| s.split(',').filter_map(|s| {
                let trimmed = s.trim();
                if trimmed.is_empty() { None } else { Some(trimmed.to_string()) }
            }).collect::<Vec<_>>())
            .unwrap_or_default();
        
        if parsed.is_empty() {
            vec!["input".to_string(), "output".to_string()]
        } else {
            parsed
        }
    }

    pub fn filters(&self) -> &[Filter] {
        &self.filters
    }

    pub fn validate_and_convert_filters(&mut self) -> Result<(), Error> {
        let field_configs = create_traces_field_configs();
        self.filters = validate_and_convert_filters(&self.filters, &field_configs)?;
        Ok(())
    }

    pub fn validate(&mut self) -> Result<(), Error> {
        self.validate_time_range()?;
        self.validate_page_size()?;
        self.validate_and_convert_filters()?;
        Ok(())
    }

    fn validate_time_range(&self) -> Result<(), Error> {
        let start = self.start_time();
        let end = self.end_time();
        
        if start >= end {
            return Err(Error::BadRequest(
                "Start time must be before end time".to_string()
            ));
        }

        let time_range = end.signed_duration_since(start);
        let max_duration = Duration::days(Self::MAX_TIME_RANGE_DAYS);
        
        if time_range > max_duration {
            return Err(Error::BadRequest(
                format!(
                    "Time range cannot exceed {} days. Current range: {} days",
                    Self::MAX_TIME_RANGE_DAYS,
                    time_range.num_days()
                )
            ));
        }
        
        Ok(())
    }

        fn validate_page_size(&self) -> Result<(), Error> {
        let page_size = self.page_size();
        
        if page_size <= 0 {
            return Err(Error::BadRequest(
                "Page size must be greater than 0".to_string()
            ));
        }

        if page_size > Self::MAX_PAGE_SIZE {
            return Err(Error::BadRequest(
                format!(
                    "Page size cannot exceed {}. Current page size: {}",
                    Self::MAX_PAGE_SIZE,
                    page_size
                )
            ));
        }
        
        Ok(())
    }
}

fn create_traces_field_configs() -> HashMap<String, FieldConfig> {
    let mut configs = HashMap::new();

    configs.insert("trace_type".to_string(), FieldConfig::new(
        FieldType::Enum,
        "t.trace_type"
    ).with_validator(validate_trace_type));

    configs.insert("id".to_string(), FieldConfig::new(
        FieldType::Uuid,
        "t.id"
    ));

    configs.insert("latency".to_string(), FieldConfig::new(
        FieldType::Float,
        "CAST(EXTRACT(EPOCH FROM (t.end_time - t.start_time)) * 1000 AS FLOAT8)"
    ));

    configs.insert("input_cost".to_string(), FieldConfig::new(
        FieldType::Float,
        "t.input_cost"
    ));

    configs.insert("output_cost".to_string(), FieldConfig::new(
        FieldType::Float,
        "t.output_cost"
    ));

    configs.insert("cost".to_string(), FieldConfig::new(
        FieldType::Float,
        "t.cost"
    ));

    configs.insert("input_token_count".to_string(), FieldConfig::new(
        FieldType::Integer,
        "t.input_token_count"
    ));

    configs.insert("output_token_count".to_string(), FieldConfig::new(
        FieldType::Integer,
        "t.output_token_count"
    ));

    configs.insert("total_token_count".to_string(), FieldConfig::new(
        FieldType::Integer,
        "t.total_token_count"
    ));

    configs.insert("metadata".to_string(), FieldConfig::new(
        FieldType::Json,
        "t.metadata"
    ));

    configs.insert("status".to_string(), FieldConfig::new(
        FieldType::Enum,
        "t.status"
    ).with_validator(validate_status));

    configs
}

fn validate_trace_type(value: &FilterValue) -> Result<(), String> {
    if let FilterValue::String(s) = value {
        TraceType::from_str(s)
            .map_err(|_| format!("Invalid trace type: {}. Valid values: DEFAULT, EVENT, EVALUATION, PLAYGROUND", s))?;
        Ok(())
    } else {
        Err("Trace type must be a string".to_string())
    }
}

fn validate_status(value: &FilterValue) -> Result<(), String> {
    if let FilterValue::String(s) = value {
        if s == "error" || s == "success" {
            Ok(())
        } else {
            Err("Status filter only supports 'error' or 'success' values".to_string())
        }
    } else {
        Err("Status must be a string".to_string())
    }
}


fn build_trace_filters<'a>(
    mut query_builder: QueryBuilder<'a, sqlx::Postgres>,
    project_id: Uuid,
    trace_ids: &'a Option<HashSet<Uuid>>,
    params: &'a SearchTracesParams,
) -> Result<QueryBuilder<'a, sqlx::Postgres>, Error> {
    query_builder.push_bind(project_id);

    if let Some(trace_ids) = trace_ids {
        query_builder.push(" AND t.id = ANY(");
        query_builder.push_bind(trace_ids.iter().cloned().collect::<Vec<Uuid>>());
        query_builder.push(")");
    }

    query_builder.push(" AND t.start_time >= ");
    query_builder.push_bind(params.start_time());
    
    query_builder.push(" AND t.end_time <= ");
    query_builder.push_bind(params.end_time());

    let field_configs = create_traces_field_configs();
    for filter in params.filters() {
        if filter.field == "status" && filter.operator == FilterOperator::Eq {
            if let FilterValue::String(status_value) = &filter.value {
                if status_value == "success" {
                    query_builder.push(" AND t.status IS NULL");
                    continue;
                }
            }
        }

        query_builder = filter.apply_to_query_builder(query_builder, &field_configs)
            .map_err(|e| Error::BadRequest(e))?;
    }

    Ok(query_builder)
}

async fn get_traces(
    pool: &sqlx::PgPool,
    project_id: Uuid,
    params: &SearchTracesParams,
    trace_ids: &Option<HashSet<Uuid>>,
) -> Result<Vec<TraceInfo>, Error> {
    if let Some(trace_ids) = trace_ids {
        if trace_ids.is_empty() {
            return Ok(Vec::new());
        }
    }

    let main_query_builder = QueryBuilder::new(
        "SELECT 
            t.id, 
            t.start_time, 
            t.end_time, 
            t.session_id,
            t.input_token_count, 
            t.output_token_count, 
            t.total_token_count,
            t.input_cost, 
            t.output_cost, 
            t.cost, 
            t.trace_type, 
            t.status,
            CAST(EXTRACT(EPOCH FROM (t.end_time - t.start_time)) * 1000 AS FLOAT8) as latency,
            t.metadata
         FROM traces t
         WHERE t.start_time IS NOT NULL AND t.end_time IS NOT NULL AND t.project_id = "
    );

    let mut main_query_builder = build_trace_filters(main_query_builder, project_id, &trace_ids, params)?;

    main_query_builder.push(" ORDER BY t.start_time DESC");
    
    if params.page_size() > 0 {
        main_query_builder.push(" LIMIT ");
        main_query_builder.push_bind(params.page_size());
    }

    if params.page_number() > 0 {
        main_query_builder.push(" OFFSET ");
        main_query_builder.push_bind(params.offset());
    }

    main_query_builder
        .build_query_as::<TraceInfo>()
        .fetch_all(pool)
        .await
        .map_err(|e| e.into())
}

async fn count_traces(
    pool: &sqlx::PgPool,
    project_id: Uuid,
    params: &SearchTracesParams,
    trace_ids: &Option<HashSet<Uuid>>,
) -> Result<i64, Error> {
    if let Some(trace_ids) = trace_ids {
        if trace_ids.is_empty() {
            return Ok(0);
        }
    }

    let count_query_builder = QueryBuilder::new(
        "SELECT COUNT(t.id) as count 
         FROM traces t
         WHERE t.start_time IS NOT NULL AND t.end_time IS NOT NULL AND t.project_id = "
    );
    let mut count_query_builder = build_trace_filters(count_query_builder, project_id, &trace_ids, params)?;

    let count_result: (i64,) = count_query_builder
        .build_query_as::<(i64,)>()
        .fetch_one(pool)
        .await?;

    Ok(count_result.0)
}

pub async fn search_traces(
    pool: &PgPool,
    clickhouse: &clickhouse::Client,
    project_id: Uuid,
    mut params: SearchTracesParams,
) -> Result<(Vec<TraceInfo>, i64), Error> {
    params.validate()?;

    let trace_ids = if let Some(search_query) = &params.search {
        match search_spans_for_trace_ids(clickhouse, project_id, search_query, &params)
            .await
            .map_err(|e| anyhow::anyhow!("{}", e))? {
            Some(ids) => Some(ids),
            None => {
                return Ok((Vec::new(), 0));
            }
        }
    } else {
        None
    };

    let (count_result, traces_result) = tokio::join!(
        count_traces(&pool, project_id, &params, &trace_ids),
        get_traces(&pool, project_id, &params, &trace_ids)
    );

    let count = count_result?;
    let data = traces_result?;

    Ok((data, count))
}