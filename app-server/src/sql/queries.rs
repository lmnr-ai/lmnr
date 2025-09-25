use std::{collections::HashMap, sync::Arc};

use serde_json::Value;
use uuid::Uuid;

use crate::{
    query_engine::QueryEngine,
    sql::{ClickhouseReadonlyClient, SqlQueryError},
};

pub async fn get_top_span_id(
    clickhouse_ro: Arc<ClickhouseReadonlyClient>,
    query_engine: Arc<QueryEngine>,
    trace_id: Uuid,
    project_id: Uuid,
) -> Result<Option<Uuid>, SqlQueryError> {
    let result = super::execute_sql_query(
        String::from("SELECT top_span_id FROM traces WHERE id = {trace_id:UUID}"),
        project_id,
        HashMap::from([("trace_id".to_string(), Value::String(trace_id.to_string()))]),
        clickhouse_ro,
        query_engine,
    )
    .await?;

    if result.is_empty() {
        Ok(None)
    } else {
        let span_id = result[0]["top_span_id"]
            .as_str()
            .and_then(|s| s.parse::<Uuid>().ok());
        Ok(span_id)
    }
}
