use serde::{Deserialize, Serialize};
use super::query_engine::{
    QueryStructure as ProtoQueryStructure, 
    Metric as ProtoMetric,
    Filter as ProtoFilter,
    TimeRange as ProtoTimeRange,
    OrderBy as ProtoOrderBy,
    AggregationFunction, ComparisonOperator, OrderDirection,
};

/// DTO versions with string enums for HTTP API
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryStructure {
    pub table: String,
    pub metrics: Vec<Metric>,
    #[serde(default)]
    pub dimensions: Vec<String>,
    #[serde(default)]
    pub filters: Vec<Filter>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub time_range: Option<TimeRange>,
    #[serde(default)]
    pub order_by: Vec<OrderBy>,
    #[serde(default)]
    pub limit: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Metric {
    pub r#fn: String, // "count", "sum", "avg", etc.
    pub column: String,
    #[serde(default)]
    pub args: Vec<f64>,
    #[serde(default)]
    pub alias: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Filter {
    pub field: String,
    pub op: String, // "eq", "ne", "gt", etc.
    pub value: FilterValue,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum FilterValue {
    String(String),
    Number(f64),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimeRange {
    pub column: String,
    pub from: String,
    pub to: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub interval_unit: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub interval_value: Option<String>,
    pub fill_gaps: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrderBy {
    pub field: String,
    pub dir: String, // "asc" or "desc"
}

// Conversion from Proto to DTO (for responses)
impl From<ProtoQueryStructure> for QueryStructure {
    fn from(proto: ProtoQueryStructure) -> Self {
        Self {
            table: proto.table,
            metrics: proto.metrics.into_iter().map(Into::into).collect(),
            dimensions: proto.dimensions,
            filters: proto.filters.into_iter().map(Into::into).collect(),
            time_range: proto.time_range.map(Into::into),
            order_by: proto.order_by.into_iter().map(Into::into).collect(),
            limit: proto.limit,
        }
    }
}

impl From<ProtoMetric> for Metric {
    fn from(proto: ProtoMetric) -> Self {
        let fn_name = match AggregationFunction::try_from(proto.r#fn).ok() {
            Some(AggregationFunction::Count) => "count",
            Some(AggregationFunction::Sum) => "sum",
            Some(AggregationFunction::Avg) => "avg",
            Some(AggregationFunction::Min) => "min",
            Some(AggregationFunction::Max) => "max",
            Some(AggregationFunction::Quantile) => "quantile",
            _ => "count", // default
        }.to_string();

        Self {
            r#fn: fn_name,
            column: proto.column,
            args: proto.args,
            alias: proto.alias,
        }
    }
}

impl From<ProtoFilter> for Filter {
    fn from(proto: ProtoFilter) -> Self {
        let op_name = match ComparisonOperator::try_from(proto.op).ok() {
            Some(ComparisonOperator::Eq) => "eq",
            Some(ComparisonOperator::Ne) => "ne",
            Some(ComparisonOperator::Gt) => "gt",
            Some(ComparisonOperator::Gte) => "gte",
            Some(ComparisonOperator::Lt) => "lt",
            Some(ComparisonOperator::Lte) => "lte",
            _ => "eq", // default
        }.to_string();

        let value = match proto.value {
            Some(super::query_engine::filter::Value::StringValue(s)) => FilterValue::String(s),
            Some(super::query_engine::filter::Value::NumberValue(n)) => FilterValue::Number(n),
            None => FilterValue::String(String::new()),
        };

        Self {
            field: proto.field,
            op: op_name,
            value,
        }
    }
}

impl From<ProtoTimeRange> for TimeRange {
    fn from(proto: ProtoTimeRange) -> Self {
        Self {
            column: proto.column,
            from: proto.from,
            to: proto.to,
            interval_unit: if proto.interval_unit.is_empty() { None } else { Some(proto.interval_unit) },
            interval_value: if proto.interval_value.is_empty() { None } else { Some(proto.interval_value) },
            fill_gaps: proto.fill_gaps,
        }
    }
}

impl From<ProtoOrderBy> for OrderBy {
    fn from(proto: ProtoOrderBy) -> Self {
        let dir_name = match OrderDirection::try_from(proto.dir).ok() {
            Some(OrderDirection::Asc) => "asc",
            Some(OrderDirection::Desc) => "desc",
            _ => "asc", // default
        }.to_string();

        Self {
            field: proto.field,
            dir: dir_name,
        }
    }
}

// Conversion from DTO to Proto (for requests)
impl From<QueryStructure> for ProtoQueryStructure {
    fn from(dto: QueryStructure) -> Self {
        Self {
            table: dto.table,
            metrics: dto.metrics.into_iter().map(Into::into).collect(),
            dimensions: dto.dimensions,
            filters: dto.filters.into_iter().map(Into::into).collect(),
            time_range: dto.time_range.map(Into::into),
            order_by: dto.order_by.into_iter().map(Into::into).collect(),
            limit: dto.limit,
        }
    }
}

impl From<Metric> for ProtoMetric {
    fn from(dto: Metric) -> Self {
        let fn_enum = match dto.r#fn.to_lowercase().as_str() {
            "count" => AggregationFunction::Count,
            "sum" => AggregationFunction::Sum,
            "avg" => AggregationFunction::Avg,
            "min" => AggregationFunction::Min,
            "max" => AggregationFunction::Max,
            "quantile" => AggregationFunction::Quantile,
            _ => AggregationFunction::Count,
        };

        Self {
            r#fn: fn_enum as i32,
            column: dto.column,
            args: dto.args,
            alias: dto.alias,
        }
    }
}

impl From<Filter> for ProtoFilter {
    fn from(dto: Filter) -> Self {
        let op_enum = match dto.op.to_lowercase().as_str() {
            "eq" => ComparisonOperator::Eq,
            "ne" => ComparisonOperator::Ne,
            "gt" => ComparisonOperator::Gt,
            "gte" => ComparisonOperator::Gte,
            "lt" => ComparisonOperator::Lt,
            "lte" => ComparisonOperator::Lte,
            _ => ComparisonOperator::Eq,
        };

        let value = match dto.value {
            FilterValue::String(s) => Some(super::query_engine::filter::Value::StringValue(s)),
            FilterValue::Number(n) => Some(super::query_engine::filter::Value::NumberValue(n)),
        };

        Self {
            field: dto.field,
            op: op_enum as i32,
            value,
        }
    }
}

impl From<TimeRange> for ProtoTimeRange {
    fn from(dto: TimeRange) -> Self {
        Self {
            column: dto.column,
            from: dto.from,
            to: dto.to,
            interval_unit: dto.interval_unit.unwrap_or_default(),
            interval_value: dto.interval_value.unwrap_or_default(),
            fill_gaps: dto.fill_gaps,
        }
    }
}

impl From<OrderBy> for ProtoOrderBy {
    fn from(dto: OrderBy) -> Self {
        let dir_enum = match dto.dir.to_lowercase().as_str() {
            "asc" => OrderDirection::Asc,
            "desc" => OrderDirection::Desc,
            _ => OrderDirection::Asc,
        };

        Self {
            field: dto.field,
            dir: dir_enum as i32,
        }
    }
}

