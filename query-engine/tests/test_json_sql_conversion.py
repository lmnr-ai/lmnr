import pytest
import sys
import os

# Add the project root and src directory to the path
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src'))

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
    COUNT(span_id) AS `value`
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
        assert "quantile(0.9)(end_time - start_time) AS `value`" in sql
        assert "model != '<null>'" in sql
        assert "span_type = 'LLM'" in sql
        assert "GROUP BY time, model" in sql
        assert "ORDER BY time WITH FILL" in sql
        assert "STEP toInterval(1, {interval_unit:String})" in sql

    def test_raw_sql_metric(self):
        """Test raw SQL metric expression is passed through directly"""
        query_json = {
            "table": "spans",
            "metrics": [
                {"fn": "raw", "column": "countIf(status = 'ERROR')", "alias": "error_count"},
                {"fn": "COUNT", "column": "*", "alias": "total"},
            ],
            "dimensions": ["name"],
            "filters": [
                {"field": "start_time", "op": "gte", "string_value": "{start_time:DateTime64}"},
                {"field": "start_time", "op": "lte", "string_value": "{end_time:DateTime64}"}
            ],
            "order_by": [{"field": "error_count", "dir": "desc"}],
            "limit": 10
        }

        sql = convert_json_to_sql(query_json)

        assert "(countIf(status = 'ERROR')) AS `error_count`" in sql
        assert "COUNT(*) AS `total`" in sql
        assert "GROUP BY name" in sql
        assert "ORDER BY error_count DESC" in sql
        assert "LIMIT 10" in sql

    def test_raw_sql_metric_backtick_alias_escaping(self):
        """Test that backticks in raw metric aliases are escaped to prevent SQL injection"""
        query_json = {
            "table": "spans",
            "metrics": [
                {"fn": "raw", "column": "count()", "alias": "my`alias"},
            ],
            "dimensions": ["name"],
            "filters": [
                {"field": "start_time", "op": "gte", "string_value": "{start_time:DateTime64}"},
                {"field": "start_time", "op": "lte", "string_value": "{end_time:DateTime64}"}
            ],
        }

        sql = convert_json_to_sql(query_json)

        assert "(count()) AS `my``alias`" in sql

    def test_raw_sql_metric_without_alias_uses_default(self):
        """Test that raw SQL metric without alias defaults to 'value'"""
        query_json = {
            "table": "spans",
            "metrics": [
                {"fn": "raw", "column": "countIf(status = 'ERROR')"},
            ],
            "dimensions": ["name"],
            "filters": [
                {"field": "start_time", "op": "gte", "string_value": "{start_time:DateTime64}"},
                {"field": "start_time", "op": "lte", "string_value": "{end_time:DateTime64}"}
            ],
        }

        sql = convert_json_to_sql(query_json)

        assert "(countIf(status = 'ERROR')) AS `value`" in sql

    def test_raw_sql_metric_rejects_subquery(self):
        """Test that subqueries in raw SQL expressions are rejected"""
        query_json = {
            "table": "spans",
            "metrics": [
                {"fn": "raw", "column": "(SELECT 1)", "alias": "bad"},
            ],
            "dimensions": ["name"],
            "filters": [
                {"field": "start_time", "op": "gte", "string_value": "{start_time:DateTime64}"},
                {"field": "start_time", "op": "lte", "string_value": "{end_time:DateTime64}"}
            ],
        }

        with pytest.raises(JsonToSqlError, match="Subqueries are not allowed"):
            convert_json_to_sql(query_json)

    def test_raw_sql_metric_rejects_blocked_functions(self):
        """Test that blocked functions in raw SQL expressions are rejected"""
        query_json = {
            "table": "spans",
            "metrics": [
                {"fn": "raw", "column": "url('http://evil.com')", "alias": "bad"},
            ],
            "dimensions": ["name"],
            "filters": [
                {"field": "start_time", "op": "gte", "string_value": "{start_time:DateTime64}"},
                {"field": "start_time", "op": "lte", "string_value": "{end_time:DateTime64}"}
            ],
        }

        with pytest.raises(JsonToSqlError, match="not allowed"):
            convert_json_to_sql(query_json)

    def test_raw_sql_metric_rejects_multiple_expressions(self):
        """Test that multi-column expressions in raw SQL are rejected"""
        query_json = {
            "table": "spans",
            "metrics": [
                {"fn": "raw", "column": "count(*), name", "alias": "bad"},
            ],
            "dimensions": ["name"],
            "filters": [
                {"field": "start_time", "op": "gte", "string_value": "{start_time:DateTime64}"},
                {"field": "start_time", "op": "lte", "string_value": "{end_time:DateTime64}"}
            ],
        }

        with pytest.raises(JsonToSqlError, match="single expression"):
            convert_json_to_sql(query_json)

    def test_raw_sql_metric_rejects_comments(self):
        """Test that SQL comments in raw SQL expressions are rejected"""
        query_json = {
            "table": "spans",
            "metrics": [
                {"fn": "raw", "column": "1 FROM other_table\n--", "alias": "bad"},
            ],
            "dimensions": ["name"],
            "filters": [
                {"field": "start_time", "op": "gte", "string_value": "{start_time:DateTime64}"},
                {"field": "start_time", "op": "lte", "string_value": "{end_time:DateTime64}"}
            ],
        }

        with pytest.raises(JsonToSqlError, match="comments are not allowed"):
            convert_json_to_sql(query_json)

    def test_raw_sql_metric_allows_comment_chars_in_strings(self):
        """Test that -- or /* inside string literals are not falsely rejected"""
        query_json = {
            "table": "spans",
            "metrics": [
                {"fn": "raw", "column": "countIf(path LIKE '--%')", "alias": "prefixed"},
            ],
            "dimensions": ["name"],
            "filters": [
                {"field": "start_time", "op": "gte", "string_value": "{start_time:DateTime64}"},
                {"field": "start_time", "op": "lte", "string_value": "{end_time:DateTime64}"}
            ],
        }

        sql = convert_json_to_sql(query_json)
        assert "(countIf(path LIKE '--%'))" in sql

    def test_metric_alias_does_not_shadow_filter_column(self):
        """Test that aggregating and filtering the same column does not produce
        an alias that shadows the column name, which would cause ClickHouse
        ILLEGAL_AGGREGATION errors (LAM-1394)."""
        query_json = {
            "table": "spans",
            "metrics": [{"fn": "avg", "column": "total_tokens"}],
            "dimensions": [],
            "filters": [
                {"field": "total_tokens", "op": "gt", "number_value": 0},
                {"field": "start_time", "op": "gte", "string_value": "{start_time:DateTime64}"},
                {"field": "start_time", "op": "lte", "string_value": "{end_time:DateTime64}"},
            ],
        }

        sql = convert_json_to_sql(query_json)

        # The alias must NOT be the bare column name "total_tokens"
        assert "AS `total_tokens`" not in sql
        # It should use fn_column pattern instead
        assert "avg(total_tokens) AS `avg_total_tokens`" in sql
        # The filter should reference the original column without conflict
        assert "total_tokens > 0" in sql

    def test_metric_with_explicit_alias_preserves_alias(self):
        """Test that an explicit alias is used as-is, even if it matches the column name."""
        query_json = {
            "table": "spans",
            "metrics": [{"fn": "sum", "column": "cost", "alias": "total_cost"}],
            "dimensions": [],
            "filters": [
                {"field": "start_time", "op": "gte", "string_value": "{start_time:DateTime64}"},
                {"field": "start_time", "op": "lte", "string_value": "{end_time:DateTime64}"},
            ],
        }

        sql = convert_json_to_sql(query_json)

        assert "sum(cost) AS `total_cost`" in sql

    def test_metric_without_alias_uses_fn_column_pattern(self):
        """Test that metrics without an explicit alias default to fn_column."""
        query_json = {
            "table": "spans",
            "metrics": [{"fn": "max", "column": "latency"}],
            "dimensions": ["name"],
            "filters": [
                {"field": "start_time", "op": "gte", "string_value": "{start_time:DateTime64}"},
                {"field": "start_time", "op": "lte", "string_value": "{end_time:DateTime64}"},
            ],
        }

        sql = convert_json_to_sql(query_json)

        assert "max(latency) AS `max_latency`" in sql

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


    def test_complex_raw_expression_not_reduced_to_sub_aggregate(self):
        """Test that complex expressions with nested aggregates are preserved as raw,
        not incorrectly reduced to a single sub-aggregate."""
        import sqlglot
        from src.sql_to_json import SqlToJsonConverter

        converter = SqlToJsonConverter()

        # Parse a division of two aggregates — should be treated as raw, not
        # reduced to the first nested aggregate found.
        expr = sqlglot.parse_one("countIf(status = 'ERROR') / count(*)", dialect="clickhouse")
        result = converter._extract_metric(expr, "error_rate")

        assert result["fn"] == "raw", f"Expected 'raw', got '{result['fn']}'"
        assert "countIf" in result["column"], f"Expected countIf in column, got '{result['column']}'"
        assert result["alias"] == "error_rate"

        # A simple top-level aggregate should still be recognized normally.
        simple_expr = sqlglot.parse_one("count(*)", dialect="clickhouse")
        simple_result = converter._extract_metric(simple_expr, "total")
        assert simple_result["fn"] == "count", f"Expected 'count', got '{simple_result['fn']}'"


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


class TestFormatValueEscaping:
    """Test that _format_value properly escapes single quotes (Fix 1)"""

    def test_format_value_escapes_single_quotes(self):
        """_format_value("O'Brien") should produce "'O''Brien'"."""
        from src.json_to_sql import JsonToSqlConverter
        converter = JsonToSqlConverter()
        result = converter._format_value("O'Brien")
        assert result == "'O''Brien'"

    def test_format_value_escapes_multiple_quotes(self):
        """Multiple single quotes should all be escaped."""
        from src.json_to_sql import JsonToSqlConverter
        converter = JsonToSqlConverter()
        result = converter._format_value("it's a 'test'")
        assert result == "'it''s a ''test'''"

    def test_format_value_no_quotes_unchanged(self):
        """Strings without quotes should be unchanged."""
        from src.json_to_sql import JsonToSqlConverter
        converter = JsonToSqlConverter()
        result = converter._format_value("hello")
        assert result == "'hello'"

    def test_format_value_numbers_unchanged(self):
        """Numbers should not be quoted."""
        from src.json_to_sql import JsonToSqlConverter
        converter = JsonToSqlConverter()
        assert converter._format_value(42) == "42"
        assert converter._format_value(3.14) == "3.14"

    def test_filter_with_single_quote_in_value(self):
        """Integration: filter with string containing quote should produce valid SQL."""
        from src.query_validator import QueryValidator, QueryValidationError
        query_json = {
            "table": "spans",
            "metrics": [{"fn": "COUNT", "column": "*", "alias": "total"}],
            "filters": [
                {"field": "name", "op": "eq", "string_value": "it's"},
                {"field": "start_time", "op": "gte", "string_value": "{start_time:DateTime64}"},
                {"field": "start_time", "op": "lte", "string_value": "{end_time:DateTime64}"}
            ],
        }
        sql = convert_json_to_sql(query_json)
        assert "it''s" in sql

        # Verify it passes through validate_and_secure_query without errors
        validator = QueryValidator()
        result = validator.validate_and_secure_query(sql, "test-project-123")
        assert "it''s" in result or "it\\'s" in result


class TestFilterFieldSanitization:
    """Test that filter field names are sanitized through _safe_column_expr (Fix 2)"""

    def test_filter_with_injection_attempt_sanitized(self):
        """A malicious field name with multiple expressions should be sanitized via AST round-trip.
        The _safe_column_expr parses and regenerates the expression, neutralizing raw injection."""
        from src.json_to_sql import JsonToSqlConverter
        converter = JsonToSqlConverter()
        # SQL comment injection: the -- eats the FROM during parsing,
        # but _safe_column_expr regenerates only the expression part
        result = converter._safe_column_expr("1=1 OR true --")
        # The regenerated expression should NOT contain the raw comment
        assert "--" not in result

    def test_filter_with_truly_malformed_field_raises(self):
        """Completely malformed SQL as field name should raise QueryBuilderError."""
        query_json = {
            "table": "spans",
            "metrics": [{"fn": "COUNT", "column": "*", "alias": "total"}],
            "filters": [
                {"field": ")))INVALID(((", "op": "eq", "string_value": "test"},
                {"field": "start_time", "op": "gte", "string_value": "{start_time:DateTime64}"},
                {"field": "start_time", "op": "lte", "string_value": "{end_time:DateTime64}"}
            ],
        }
        with pytest.raises(JsonToSqlError):
            convert_json_to_sql(query_json)

    def test_filter_with_valid_field(self):
        """A valid field name should work normally."""
        query_json = {
            "table": "spans",
            "metrics": [{"fn": "COUNT", "column": "*", "alias": "total"}],
            "filters": [
                {"field": "name", "op": "eq", "string_value": "test"},
                {"field": "start_time", "op": "gte", "string_value": "{start_time:DateTime64}"},
                {"field": "start_time", "op": "lte", "string_value": "{end_time:DateTime64}"}
            ],
        }
        sql = convert_json_to_sql(query_json)
        assert "name = 'test'" in sql

    def test_filter_with_dotted_field(self):
        """A dotted field like spans.name should work correctly."""
        query_json = {
            "table": "spans",
            "metrics": [{"fn": "COUNT", "column": "*", "alias": "total"}],
            "filters": [
                {"field": "spans.name", "op": "eq", "string_value": "test"},
                {"field": "start_time", "op": "gte", "string_value": "{start_time:DateTime64}"},
                {"field": "start_time", "op": "lte", "string_value": "{end_time:DateTime64}"}
            ],
        }
        sql = convert_json_to_sql(query_json)
        assert "spans.name" in sql
        assert "= 'test'" in sql

    def test_filter_includes_with_sanitized_field(self):
        """The includes operator should also sanitize field names."""
        query_json = {
            "table": "spans",
            "metrics": [{"fn": "COUNT", "column": "*", "alias": "total"}],
            "filters": [
                {"field": "tags", "op": "includes", "string_value": "important"},
                {"field": "start_time", "op": "gte", "string_value": "{start_time:DateTime64}"},
                {"field": "start_time", "op": "lte", "string_value": "{end_time:DateTime64}"}
            ],
        }
        sql = convert_json_to_sql(query_json)
        assert "has(tags, 'important')" in sql

    def test_filter_includes_injection_attempt_raises(self):
        """Injection via includes field name should be rejected."""
        query_json = {
            "table": "spans",
            "metrics": [{"fn": "COUNT", "column": "*", "alias": "total"}],
            "filters": [
                {"field": "1); DROP TABLE spans --", "op": "includes", "string_value": "test"},
                {"field": "start_time", "op": "gte", "string_value": "{start_time:DateTime64}"},
                {"field": "start_time", "op": "lte", "string_value": "{end_time:DateTime64}"}
            ],
        }
        with pytest.raises(JsonToSqlError):
            convert_json_to_sql(query_json)


class TestLimitTypeChecking:
    """Test that limit is properly type-checked (Fix 5)"""

    def test_limit_sql_injection_attempt_raises(self):
        """limit = '10; DROP TABLE' should raise QueryBuilderError."""
        query_json = {
            "table": "spans",
            "metrics": [{"fn": "COUNT", "column": "*", "alias": "total"}],
            "dimensions": ["name"],
            "limit": "10; DROP TABLE"
        }
        with pytest.raises(JsonToSqlError, match="LIMIT must be a positive integer"):
            convert_json_to_sql(query_json)

    def test_limit_negative_raises(self):
        """limit = -1 should raise QueryBuilderError."""
        query_json = {
            "table": "spans",
            "metrics": [{"fn": "COUNT", "column": "*", "alias": "total"}],
            "dimensions": ["name"],
            "limit": -1
        }
        with pytest.raises(JsonToSqlError, match="LIMIT must be a positive integer"):
            convert_json_to_sql(query_json)

    def test_limit_zero_raises(self):
        """limit = 0 should raise QueryBuilderError."""
        query_json = {
            "table": "spans",
            "metrics": [{"fn": "COUNT", "column": "*", "alias": "total"}],
            "dimensions": ["name"],
            "limit": 0
        }
        with pytest.raises(JsonToSqlError, match="LIMIT must be a positive integer"):
            convert_json_to_sql(query_json)

    def test_limit_valid_integer(self):
        """limit = 10 should produce LIMIT 10."""
        query_json = {
            "table": "spans",
            "metrics": [{"fn": "COUNT", "column": "*", "alias": "total"}],
            "dimensions": ["name"],
            "limit": 10
        }
        sql = convert_json_to_sql(query_json)
        assert "LIMIT 10" in sql

    def test_limit_valid_string_number(self):
        """limit = '10' (string of valid number) should produce LIMIT 10."""
        query_json = {
            "table": "spans",
            "metrics": [{"fn": "COUNT", "column": "*", "alias": "total"}],
            "dimensions": ["name"],
            "limit": "10"
        }
        sql = convert_json_to_sql(query_json)
        assert "LIMIT 10" in sql

    def test_limit_none_omitted(self):
        """limit = None should not produce a LIMIT clause."""
        query_json = {
            "table": "spans",
            "metrics": [{"fn": "COUNT", "column": "*", "alias": "total"}],
            "dimensions": ["name"],
            "limit": None
        }
        sql = convert_json_to_sql(query_json)
        assert "LIMIT" not in sql


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

