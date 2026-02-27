import pytest
import sys
import os

# Add the src directory to the path
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))

from src.json_to_sql import convert_json_to_sql, QueryBuilderError as JsonToSqlError
from src.sql_to_json import convert_sql_to_json, QueryBuilderError as SqlToJsonError


class TestJsonToSqlConversion:
    """Test JSON to SQL conversion with real-world query examples"""

    def test_simple_query_with_limit(self):
        """Test simple aggregation query: SELECT name, COUNT(span_id) FROM spans ... LIMIT 5"""
        query_json = {
            "table": "spans",
            "metrics": [{"fn": "COUNT", "column": "span_id", "alias": "value"}],
            "dimensions": ["name"],
            "filters": [
                {"field": "start_time", "op": "gte", "string_value": "{start_time:DateTime64}"},
                {"field": "start_time", "op": "lte", "string_value": "{end_time:DateTime64}"}
            ],
            "order_by": [{"field": "value", "dir": "desc"}],
            "limit": 5
        }

        sql = convert_json_to_sql(query_json)
        
        expected_sql = """SELECT
    name,
    COUNT(span_id) AS value
FROM spans
WHERE
    start_time >= {start_time:DateTime64}
    AND start_time <= {end_time:DateTime64}
GROUP BY name
ORDER BY value DESC
LIMIT 5"""
        
        assert sql == expected_sql

    def test_time_series_query_with_fill(self):
        """Test time series query with quantile and WITH FILL for gap filling"""
        query_json = {
            "table": "spans",
            "time_range": {
                "column": "start_time",
                "from": "{start_time:DateTime64}",
                "to": "{end_time:DateTime64}",
                "interval_unit": "{interval_unit:String}",
                "interval_value": "1",
                "fill_gaps": True
            },
            "dimensions": ["model"],
            "metrics": [{"fn": "quantile", "column": "end_time - start_time", "args": [0.9], "alias": "value"}],
            "filters": [
                {"field": "model", "op": "ne", "string_value": "<null>"},  # _format_value adds quotes
                {"field": "span_type", "op": "eq", "string_value": "LLM"}  # _format_value adds quotes
            ]
        }

        sql = convert_json_to_sql(query_json)
        
        # Verify key components are present
        assert "toStartOfInterval(start_time, toInterval(1, {interval_unit:String})) AS time" in sql
        assert "quantile(0.9)(end_time - start_time) AS value" in sql
        assert "model != '<null>'" in sql
        assert "span_type = 'LLM'" in sql
        assert "GROUP BY time, model" in sql
        assert "ORDER BY time WITH FILL" in sql
        assert "STEP toInterval(1, {interval_unit:String})" in sql

    def test_empty_query_validation(self):
        """Test that queries with no metrics, dimensions, or time_range are rejected"""
        query_json = {
            "table": "spans",
            "filters": [{"field": "name", "op": "eq", "string_value": "'test'"}]
        }

        with pytest.raises(JsonToSqlError, match="Query must have at least one of: metrics, dimensions, or time_range"):
            convert_json_to_sql(query_json)


class TestSqlToJsonConversion:
    """Test SQL to JSON conversion with real-world query examples"""

    def test_simple_query_with_limit(self):
        """Test parsing simple aggregation query"""
        sql = """
SELECT
    name,
    COUNT(span_id) AS value
FROM spans
WHERE
    start_time >= {start_time:DateTime64}
  AND start_time <= {end_time:DateTime64}
GROUP BY name
ORDER BY value DESC
LIMIT 5
"""
        result = convert_sql_to_json(sql)
        
        assert result["table"] == "spans"
        assert result["metrics"][0]["fn"] == "count"  # sql_to_json returns lowercase
        assert result["metrics"][0]["column"] == "span_id"
        assert "name" in result["dimensions"]
        assert result["limit"] == 5
        assert result["order_by"][0]["field"] == "value"
        assert result["order_by"][0]["dir"] == "desc"

    def test_time_series_query_with_fill(self):
        """Test parsing time series query with WITH FILL"""
        sql = """
SELECT
    toStartOfInterval(start_time, toInterval(1, {interval_unit:String})) AS time,
    model,
    quantile(0.9)(end_time - start_time) AS value
FROM spans
WHERE
    model != '<null>'
  AND span_type = 'LLM'
  AND start_time >= {start_time:DateTime64}
  AND start_time <= {end_time:DateTime64}
GROUP BY time, model
ORDER BY time
WITH FILL
FROM toStartOfInterval({start_time:DateTime64}, toInterval(1, {interval_unit:String}))
TO toStartOfInterval({end_time:DateTime64}, toInterval(1, {interval_unit:String}))
STEP toInterval(1, {interval_unit:String})
"""
        result = convert_sql_to_json(sql)
        
        assert result["table"] == "spans"
        assert result["time_range"]["column"] == "start_time"
        assert result["time_range"]["fill_gaps"] is True
        assert "model" in result["dimensions"]
        # Verify quantile is properly parsed
        assert result["metrics"][0]["fn"] == "quantile"
        assert result["metrics"][0]["args"] == [0.9]
        assert result["metrics"][0]["column"] == "end_time - start_time"
        assert result["metrics"][0]["alias"] == "value"


class TestRawSqlMetrics:
    """Test raw SQL metric support in both directions"""

    def test_json_to_sql_with_raw_metric(self):
        """Test that raw SQL metrics are passed through directly"""
        query_json = {
            "table": "spans",
            "metrics": [
                {"fn": "raw", "column": "", "raw_sql": "countIf(status = 'ERROR')", "alias": "error_count", "args": []}
            ],
            "dimensions": [],
            "filters": [
                {"field": "start_time", "op": "gte", "string_value": "{start_time:DateTime64}"},
                {"field": "start_time", "op": "lte", "string_value": "{end_time:DateTime64}"}
            ],
        }

        sql = convert_json_to_sql(query_json)

        assert "countIf(status = 'ERROR') AS error_count" in sql
        assert "FROM spans" in sql

    def test_json_to_sql_with_raw_and_standard_metrics(self):
        """Test mixing raw SQL and standard metrics"""
        query_json = {
            "table": "spans",
            "metrics": [
                {"fn": "count", "column": "*", "alias": "total", "args": []},
                {"fn": "raw", "column": "", "raw_sql": "sumIf(total_cost, status = 'OK')", "alias": "success_cost", "args": []},
            ],
            "dimensions": ["model"],
            "filters": [],
        }

        sql = convert_json_to_sql(query_json)

        assert "count(*) AS total" in sql
        assert "sumIf(total_cost, status = 'OK') AS success_cost" in sql
        assert "model" in sql

    def test_json_to_sql_raw_metric_missing_sql_raises_error(self):
        """Test that raw metric without raw_sql raises an error"""
        query_json = {
            "table": "spans",
            "metrics": [
                {"fn": "raw", "column": "", "alias": "broken", "args": []}
            ],
        }

        with pytest.raises(JsonToSqlError, match="raw_sql is required"):
            convert_json_to_sql(query_json)

    def test_sql_to_json_with_custom_expression(self):
        """Test that unrecognized expressions are parsed as raw SQL"""
        sql = """
SELECT
    countIf(status = 'ERROR') AS error_count
FROM spans
WHERE
    start_time >= {start_time:DateTime64}
    AND start_time <= {end_time:DateTime64}
"""
        result = convert_sql_to_json(sql)

        assert result["table"] == "spans"
        assert len(result["metrics"]) == 1
        metric = result["metrics"][0]
        assert metric["fn"] == "raw"
        assert "raw_sql" in metric
        assert metric["alias"] == "error_count"

    def test_raw_sql_roundtrip(self):
        """Test that raw SQL metrics survive a roundtrip"""
        original_json = {
            "table": "spans",
            "metrics": [
                {"fn": "raw", "column": "", "raw_sql": "uniqExact(trace_id)", "alias": "unique_traces", "args": []}
            ],
            "dimensions": ["model"],
            "filters": [
                {"field": "start_time", "op": "gte", "string_value": "{start_time:DateTime64}"},
                {"field": "start_time", "op": "lte", "string_value": "{end_time:DateTime64}"}
            ],
        }

        sql = convert_json_to_sql(original_json)
        assert "uniqExact(trace_id) AS unique_traces" in sql

        result = convert_sql_to_json(sql)
        assert result["table"] == "spans"
        assert len(result["metrics"]) == 1
        assert result["metrics"][0]["alias"] == "unique_traces"


class TestRoundTripConversion:
    """Test that queries survive round-trip conversion: JSON -> SQL -> JSON"""

    def test_simple_query_roundtrip(self):
        """Test simple query round-trip"""
        original_json = {
            "table": "spans",
            "metrics": [{"fn": "COUNT", "column": "span_id", "alias": "value"}],
            "dimensions": ["name"],
            "filters": [
                {"field": "start_time", "op": "gte", "string_value": "{start_time:DateTime64}"},
                {"field": "start_time", "op": "lte", "string_value": "{end_time:DateTime64}"}
            ],
            "order_by": [{"field": "value", "dir": "desc"}],
            "limit": 5
        }

        sql = convert_json_to_sql(original_json)
        result_json = convert_sql_to_json(sql)

        assert result_json["table"] == original_json["table"]
        # sql_to_json returns lowercase function names
        assert result_json["metrics"][0]["fn"] == original_json["metrics"][0]["fn"].lower()
        assert result_json["limit"] == original_json["limit"]

    def test_time_series_query_roundtrip(self):
        """Test time series query round-trip (basic structure check)"""
        original_json = {
            "table": "spans",
            "time_range": {
                "column": "start_time",
                "from": "{start_time:DateTime64}",
                "to": "{end_time:DateTime64}",
                "interval_unit": "{interval_unit:String}",
                "interval_value": "1",
                "fill_gaps": True
            },
            "dimensions": ["model"],
            "metrics": [{"fn": "COUNT", "column": "*", "alias": "value"}],  # Use COUNT for more reliable parsing
            "filters": [
                {"field": "model", "op": "ne", "string_value": "<null>"},  # _format_value adds quotes
                {"field": "span_type", "op": "eq", "string_value": "LLM"}  # _format_value adds quotes
            ]
        }

        sql = convert_json_to_sql(original_json)
        result_json = convert_sql_to_json(sql)

        assert result_json["table"] == original_json["table"]
        assert result_json["time_range"]["fill_gaps"] == original_json["time_range"]["fill_gaps"]
        assert result_json["time_range"]["column"] == original_json["time_range"]["column"]
        assert len(result_json["metrics"]) > 0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

