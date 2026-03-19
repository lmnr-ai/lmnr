import pytest
import sys
import os

from sqlglot import parse_one
from sqlglot import exp

# Add the current directory to the path so we can import modules
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from src.query_validator import (
    QueryValidator,
    TableRegistry,
    QueryValidationError,
)

# Test fixtures
@pytest.fixture
def sample_project_id():
    return "test-project-123"


@pytest.fixture
def table_registry():
    """Create a table registry for testing"""
    return TableRegistry()


@pytest.fixture
def query_validator() -> QueryValidator:
    """Create a query validator for testing"""
    return QueryValidator()


class TestTableRegistry:
    """Test the TableRegistry class"""

    def test_default_tables_registered(self, table_registry: TableRegistry):
        """Test that default tables are registered"""
        assert table_registry.is_table_allowed('spans')
        assert table_registry.is_table_allowed('traces')
        assert table_registry.is_table_allowed('evaluation_datapoints')
        assert table_registry.is_table_allowed('events')
        assert table_registry.is_table_allowed('tags')

        assert not table_registry.is_table_allowed('unknown_table')
        assert not table_registry.is_table_allowed('traces_v0')
        assert not table_registry.is_table_allowed('spans_v0')
        assert not table_registry.is_table_allowed('evaluation_datapoints_v0')
        assert not table_registry.is_table_allowed('events_v0')
        assert not table_registry.is_table_allowed('tags_v0')

    def test_spans_table_schema(self, table_registry: TableRegistry):
        """Test spans table schema"""
        spans_schema = table_registry.get_table_schema('spans')
        assert spans_schema is not None
        assert spans_schema.name == 'spans'
        assert 'span_id' in spans_schema.allowed_columns
        assert 'start_time' in spans_schema.allowed_columns
        assert spans_schema.time_column == 'start_time'

    def test_traces_table_schema(self, table_registry: TableRegistry):
        """Test traces table schema"""
        traces_schema = table_registry.get_table_schema('traces')
        assert traces_schema is not None
        assert traces_schema.name == 'traces'
        assert 'id' in traces_schema.allowed_columns
        assert 'start_time' in traces_schema.allowed_columns
        assert traces_schema.time_column == 'start_time'

    def test_column_validation(self, table_registry: TableRegistry):
        """Test column validation for tables"""
        spans_schema = table_registry.get_table_schema('spans')
        assert spans_schema.is_column_allowed('span_id')
        assert spans_schema.is_column_allowed('SPAN_ID')  # Case insensitive
        assert not spans_schema.is_column_allowed('invalid_column')


class TestQueryValidator:
    """Test the QueryValidator class"""

    def test_validate_basic_spans_select(self, query_validator: QueryValidator, sample_project_id: str):
        """Test validation of basic SELECT query on spans"""
        query = "SELECT span_id, name FROM spans"
        result = query_validator.validate_and_secure_query(query, sample_project_id)

        # Should replace spans with spans_v0 function call
        assert f"FROM spans_v0(project_id = '{sample_project_id}')" in result

    def test_validate_basic_traces_select(self, query_validator: QueryValidator, sample_project_id: str):
        """Test validation of basic SELECT query on traces"""
        query = "SELECT id, start_time FROM traces"
        result = query_validator.validate_and_secure_query(query, sample_project_id)

        # Should replace traces with traces_v0 function call
        assert f"""FROM traces_v0(
  project_id = '{sample_project_id}',
  start_time = '1970-01-01 00:00:00',
  end_time = '2099-12-31 23:59:59'
) AS traces""" in result

    def test_validate_events_select(self, query_validator: QueryValidator, sample_project_id: str):
        """Test validation of SELECT query on events"""
        query = "SELECT id, name FROM events"
        result = query_validator.validate_and_secure_query(query, sample_project_id)

        assert f"FROM events_v0(project_id = '{sample_project_id}') AS events" in result

    def test_validate_tags_select(self, query_validator: QueryValidator, sample_project_id: str):
        """Test validation of SELECT query on tags"""
        query = "SELECT id, name, source FROM tags"
        result = query_validator.validate_and_secure_query(query, sample_project_id)

        assert f"FROM tags_v0(project_id = '{sample_project_id}') AS tags" in result

    def test_validate_evaluation_datapoints_select(self, query_validator: QueryValidator, sample_project_id: str):
        """Test validation of SELECT query on evaluation_datapoints"""
        query = "SELECT id, evaluation_id FROM evaluation_datapoints"
        result = query_validator.validate_and_secure_query(query, sample_project_id)

        assert f"FROM evaluation_datapoints_v0(project_id = '{sample_project_id}') AS evaluation_datapoints" in result

    def test_traces_with_time_filters(self, query_validator: QueryValidator, sample_project_id: str):
        """Test traces query with time filters"""
        query = "SELECT id FROM traces WHERE start_time >= '2024-01-01' AND end_time <= '2024-01-02'"
        result = query_validator.validate_and_secure_query(query, sample_project_id)

        # Should extract time filters and use them in the view function
        assert f"FROM traces_v0(project_id = '{sample_project_id}', start_time = '2024-01-01', end_time = '2024-01-02') AS traces" in result

    def test_traces_with_partial_time_filters(self, query_validator: QueryValidator, sample_project_id: str):
        """Test traces query with only start_time filter"""
        query = "SELECT id FROM traces WHERE start_time > '2024-01-01'"
        result = query_validator.validate_and_secure_query(query, sample_project_id)

        # Should extract start_time and use default end_time
        assert f"""FROM traces_v0(
  project_id = '{sample_project_id}',
  start_time = '2024-01-01',
  end_time = '2099-12-31 23:59:59'
) AS traces""" in result

    def test_reject_write_operations(self, query_validator: QueryValidator, sample_project_id: str):
        """Test that write operations are rejected"""
        write_queries = [
            "INSERT INTO spans VALUES (1, 'test')",
            "UPDATE spans SET span_name = 'test'",
            "DELETE FROM spans WHERE span_id = 'test'",
            "DROP TABLE spans",
            "TRUNCATE TABLE spans",
            "ALTER TABLE spans DROP COLUMN span_name",
            "ALTER TABLE spans RENAME COLUMN span_name TO new_name",
            "ALTER TABLE spans ADD COLUMN new_column INT",
            "ALTER TABLE spans DROP COLUMN span_name",
            "ALTER TABLE spans RENAME COLUMN span_name TO new_name",
            "ALTER TABLE spans DELETE WHERE 1=1",
            "ALTER TABLE spans UPDATE span_name = 'test' WHERE 1=1",
            "UPDATE spans SET span_name = 'test' WHERE 1=1",
        ]

        for query in write_queries:
            with pytest.raises(QueryValidationError, match="Only SELECT statements are allowed"):
                query_validator.validate_and_secure_query(query, sample_project_id)

    def test_reject_unknown_table(self, query_validator: QueryValidator, sample_project_id: str):
        """Test that unknown tables are rejected"""
        with pytest.raises(QueryValidationError, match="not allowed"):
            query_validator.validate_and_secure_query("SELECT * FROM unknown_table", sample_project_id)

    def test_reject_non_select(self, query_validator: QueryValidator, sample_project_id: str):
        """Test that non-SELECT statements are rejected"""
        with pytest.raises(QueryValidationError, match="Only SELECT statements are allowed"):
            query_validator.validate_and_secure_query("SHOW TABLES", sample_project_id)

    def test_reject_ch_system_tables(self, query_validator: QueryValidator, sample_project_id: str):
        """Test that unknown tables are rejected"""
        with pytest.raises(QueryValidationError, match="not allowed"):
            query_validator.validate_and_secure_query("SELECT * FROM system.users", sample_project_id)

    def test_reject_dangerous_functions(self, query_validator: QueryValidator, sample_project_id: str):
        """Test that dangerous ClickHouse functions are blocked"""
        dangerous_queries = [
            "SELECT url('http://attacker.com') FROM spans",
            "SELECT file('/etc/passwd') FROM spans",
            "SELECT * FROM remote('attacker.com', 'db', 'table')",
            "SELECT * FROM remoteSecure('attacker.com', 'db', 'table')",
            "SELECT * FROM s3('http://bucket/key')",
            "SELECT * FROM mysql('host', 'db', 'table', 'user', 'pass')",
            "SELECT * FROM postgresql('host', 'db', 'table', 'user', 'pass')",
        ]

        for query in dangerous_queries:
            with pytest.raises(QueryValidationError, match="not allowed"):
                query_validator.validate_and_secure_query(query, sample_project_id)

    def test_allow_safe_functions(self, query_validator: QueryValidator, sample_project_id: str):
        """Test that safe aggregate and scalar functions are allowed"""
        safe_queries = [
            "SELECT countIf(status = 'ERROR') FROM spans",
            "SELECT sum(total_cost) FROM spans",
            "SELECT toStartOfInterval(start_time, INTERVAL 5 MINUTE) AS t FROM spans",
            "SELECT quantile(0.9)(duration) FROM spans",
        ]

        for query in safe_queries:
            # Should not raise
            query_validator.validate_and_secure_query(query, sample_project_id)

    def test_reject_project_id_access(self, query_validator: QueryValidator, sample_project_id: str):
        """Test that direct project_id access is rejected"""
        with pytest.raises(QueryValidationError, match="Column 'project_id' does not exist"):
            query_validator.validate_and_secure_query("SELECT span_id, project_id FROM spans", sample_project_id)

    def test_reject_invalid_column(self, query_validator: QueryValidator, sample_project_id: str):
        """Test that invalid columns are rejected"""
        with pytest.raises(QueryValidationError, match="Column 'invalid_column' does not exist"):
            query_validator.validate_and_secure_query("SELECT spans.invalid_column FROM spans", sample_project_id)

    def test_cte_with_spans(self, query_validator: QueryValidator, sample_project_id: str):
        """Test CTE that references spans table"""
        query = """
        WITH span_stats AS (
            SELECT span_id, COUNT(*) as count
            FROM spans
            GROUP BY span_id
        )
        SELECT * FROM span_stats
        """
        result = query_validator.validate_and_secure_query(query, sample_project_id)

        # CTE should have spans replaced with spans_v0
        assert f"FROM spans_v0(project_id = '{sample_project_id}') AS spans" in result
        # CTE reference should remain unchanged
        assert "FROM span_stats" in result


    def test_subquery_with_spans(self, query_validator: QueryValidator, sample_project_id: str):
        """Test subquery that references spans table"""
        query = """
        SELECT * FROM (
            SELECT span_id, COUNT(*) as count
            FROM spans
            GROUP BY span_id
        ) span_stats
        """
        result = query_validator.validate_and_secure_query(query, sample_project_id)

        # Subquery should have spans replaced with spans_v0
        assert f"FROM spans_v0(project_id = '{sample_project_id}') AS spans" in result
        assert "AS span_stats" in result or ") span_stats" in result

    def test_join_with_allowed_tables(self, query_validator: QueryValidator, sample_project_id: str):
        """Test JOIN between allowed tables"""
        query = """
        SELECT s.span_id, t.trace_id
        FROM spans s
        JOIN traces t ON s.trace_id = t.trace_id
        """
        result = query_validator.validate_and_secure_query(query, sample_project_id)

        # Both tables should be replaced with their view functions
        assert f"FROM spans_v0(project_id = '{sample_project_id}') AS s" in result
        assert f"""JOIN traces_v0(
  project_id = '{sample_project_id}',
  start_time = '1970-01-01 00:00:00',
  end_time = '2099-12-31 23:59:59'
) AS t""" in result

    def test_complex_nested_query(self, query_validator: QueryValidator, sample_project_id: str):
        """Test complex nested query validation"""
        query = """
        SELECT s1.span_id, s1.start_time
        FROM spans s1
        WHERE s1.trace_id IN (
            SELECT trace_id
            FROM spans s2
            WHERE s2.name = 'test'
        )
        """
        result = query_validator.validate_and_secure_query(query, sample_project_id)

        # All spans references should be replaced with spans_v0
        spans_v0_count = result.count("spans_v0")
        assert spans_v0_count >= 2  # Main query and subquery
        project_filter_count = result.count(f"project_id = '{sample_project_id}'")
        assert project_filter_count >= 2  # Main query and subquery

class TestExpectedQueryTransformations:
    """Test expected query transformations with specific examples"""

    def test_basic_spans_query_transformation(self, query_validator: QueryValidator, sample_project_id: str):
        """Test basic spans query transformation"""
        input_query = "SELECT span_id, name FROM spans"
        result = query_validator.validate_and_secure_query(input_query, sample_project_id)

        assert f"spans_v0(project_id = '{sample_project_id}') AS spans" in result
        assert "SELECT\n  span_id,\n  name\nFROM" in result

    def test_basic_traces_query_transformation(self, query_validator: QueryValidator, sample_project_id: str):
        """Test basic traces query transformation"""
        input_query = "SELECT id, duration FROM traces"
        result = query_validator.validate_and_secure_query(input_query, sample_project_id)

        # Should include all three parameters for traces_v0
        assert f"""traces_v0(
  project_id = '{sample_project_id}',
  start_time = '1970-01-01 00:00:00',
  end_time = '2099-12-31 23:59:59'
) AS traces""" in result

    def test_spans_with_where_clause(self, query_validator: QueryValidator, sample_project_id: str):
        """Test spans query with WHERE clause"""
        input_query = "SELECT span_id FROM spans WHERE name = 'test_span'"
        result = query_validator.validate_and_secure_query(input_query, sample_project_id)

        # Should preserve the WHERE clause and add view function
        assert f"spans_v0(project_id = '{sample_project_id}') AS spans" in result
        assert "WHERE\n  name = 'test_span'" in result

    def test_spans_with_order_by_and_limit(self, query_validator: QueryValidator, sample_project_id: str):
        """Test spans query with ORDER BY and LIMIT"""
        input_query = "SELECT span_id FROM spans ORDER BY start_time DESC LIMIT 10"
        result = query_validator.validate_and_secure_query(input_query, sample_project_id)

        # Should preserve ORDER BY and LIMIT
        assert f"spans_v0(project_id = '{sample_project_id}') AS spans" in result
        assert "ORDER BY\n  start_time DESC" in result
        assert "LIMIT 10" in result

    def test_spans_time_range_query(self, query_validator: QueryValidator, sample_project_id: str):
        """Test spans time range query - time filters should NOT be pushed to traces CTE"""
        input_query = "SELECT start_time FROM spans WHERE start_time > now() - interval '1 hour' LIMIT 1"
        result = query_validator.validate_and_secure_query(input_query, sample_project_id)

        main_query_part = result.split("FROM spans_v0")[-1]
        assert "start_time > now() - INTERVAL '1' HOUR" in main_query_part

        assert f"SELECT\n  start_time\nFROM spans_v0(project_id = '{sample_project_id}') AS spans" in result

        assert "LIMIT 1" in result

    def test_traces_time_range_query(self, query_validator: QueryValidator, sample_project_id: str):
        """Test traces time range query"""
        input_query = "SELECT id, duration FROM traces WHERE start_time >= '2024-01-01' AND end_time <= '2024-01-02'"
        result = query_validator.validate_and_secure_query(input_query, sample_project_id)

        # Should extract time filters for the view function
        assert f"""traces_v0(project_id = '{sample_project_id}', start_time = '2024-01-01', end_time = '2024-01-02') AS traces""" in result

    def test_traces_time_range_query_between(self, query_validator: QueryValidator, sample_project_id: str):
        """Test traces time range query"""
        input_query = "SELECT id, duration FROM traces WHERE start_time BETWEEN '2024-01-01' AND '2024-01-02'"
        result = query_validator.validate_and_secure_query(input_query, sample_project_id)

        # Should extract time filters for the view function
        assert f"""traces_v0(project_id = '{sample_project_id}', start_time = '2024-01-01', end_time = '2024-01-02') AS traces""" in result

    def test_multiple_tables_in_join(self, query_validator: QueryValidator, sample_project_id: str):
        """Test query with multiple tables in JOIN"""
        input_query = """
        SELECT s.span_id, t.duration, e.name as event_name
        FROM spans s
        JOIN traces t ON s.trace_id = t.trace_id
        LEFT JOIN events e ON s.span_id = e.span_id
        """
        result = query_validator.validate_and_secure_query(input_query, sample_project_id)

        # All three tables should be replaced with their view functions
        assert f"spans_v0(project_id = '{sample_project_id}') AS s" in result
        assert f"""traces_v0(
  project_id = '{sample_project_id}',
  start_time = '1970-01-01 00:00:00',
  end_time = '2099-12-31 23:59:59'
) AS t""" in result
        assert f"events_v0(project_id = '{sample_project_id}') AS e" in result


    def test_query_parameters_intact(self, query_validator: QueryValidator, sample_project_id: str):
        input_query = """
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
        result = query_validator.validate_and_secure_query(input_query, sample_project_id)
        assert """WHERE
  start_time >= {start_time: DateTime64} AND start_time <= {end_time: DateTime64}
""" in result

    def test_query_parameters_complex_query_parameters_intact(self, query_validator: QueryValidator, sample_project_id: str):
        input_query = """
SELECT
    toStartOfInterval(start_time, INTERVAL 5 MINUTE) AS time,
    model,
    quantile(0.9)(end_time - start_time) AS value
FROM spans
WHERE
    model != '<null>'
    AND span_type IN [0, 1]
    AND start_time >= {start_time:DateTime64}
    AND start_time <= {end_time:DateTime64}
GROUP BY time, model
ORDER BY time
WITH FILL
FROM (
    toStartOfInterval({start_time:DateTime64}, INTERVAL 5 MINUTE)
)
TO (
    toStartOfInterval({start_time:DateTime64}, INTERVAL 5 MINUTE)
)
STEP INTERVAL 5 MINUTE
"""
        result = query_validator.validate_and_secure_query(input_query, sample_project_id)
        assert """WHERE
  model <> '<null>'
  AND span_type IN (0, 1)
  AND start_time >= {start_time: DateTime64}
  AND start_time <= {end_time: DateTime64}""" in result
        assert """WITH FILL FROM (
    toStartOfInterval({start_time: DateTime64}, INTERVAL '5' MINUTE)
  ) TO (
    toStartOfInterval({start_time: DateTime64}, INTERVAL '5' MINUTE)
  )""" in result

    def test_cte_join_traces_and_spans_group_by_user_id(self, query_validator: QueryValidator, sample_project_id: str):
        """CTEs over traces and spans with GROUP BY should select and group by project_id, and keep USING join."""
        input_query = """
WITH
  trace_pivot AS (
    SELECT
      toString(user_id) AS user_id,
      sum(end_time - start_time) AS total_duration
    FROM traces
    WHERE 
      start_time >= toDateTime('2025-08-06 00:00:00')
      AND start_time <  toDateTime('2025-08-09 00:00:00')
    group by user_id
  ),
  spans_pivot AS (
    SELECT
      toString(user_id) AS user_id,
      sumIf((end_time - start_time),
            name IN ('llm_api_handler','llm_api_handler_with_router_and_fallback')) AS llm_duration,
      sumIf((end_time - start_time),
            name = 'scrape_website') AS scrape_duration,
      sumIf((end_time - start_time),
            name = 'take_scrolling_screenshot') AS screenshot_duration
    FROM spans
    WHERE start_time >= toDateTime('2025-08-06 00:00:00')
      AND start_time <  toDateTime('2025-08-09 00:00:00')
    group by user_id
  )
SELECT
  *
FROM trace_pivot
LEFT JOIN spans_pivot USING (user_id)
"""

        result = query_validator.validate_and_secure_query(input_query, sample_project_id)

        # Parse and inspect CTEs structurally to avoid brittle string matching
        parsed = parse_one(result, read="clickhouse")
        assert isinstance(parsed, exp.Select)

        with_clause = parsed.args.get("with")
        assert with_clause is not None
        ctes = {cte.alias: cte.this for cte in with_clause.expressions}

        # Validate trace_pivot CTE
        assert "trace_pivot" in ctes
        trace_cte = ctes["trace_pivot"]

        assert f"""FROM traces_v0(
    project_id = '{sample_project_id}',
    start_time = toDateTime('2025-08-06 00:00:00'),
    end_time = toDateTime('2025-08-09 00:00:00')
  ) AS traces""" in result
        assert f"FROM spans_v0(project_id = '{sample_project_id}') AS spans" in result

        where_expr = trace_cte.args.get("where")
        assert where_expr is not None
        assert "start_time >= toDateTime('2025-08-06 00:00:00') AND start_time < toDateTime('2025-08-09 00:00:00')" in trace_cte.args["where"].sql(dialect="clickhouse")

        # Validate spans_pivot CTE
        assert "spans_pivot" in ctes
        spans_cte = ctes["spans_pivot"]

        where_expr = spans_cte.args.get("where")
        assert where_expr is not None
        assert "start_time >= toDateTime('2025-08-06 00:00:00') AND start_time < toDateTime('2025-08-09 00:00:00')" in spans_cte.args["where"].sql(dialect="clickhouse")

        # Join should remain on user_id (handle USING representation as list or node)
        def using_idents(join: exp.Join):
            using_val = join.args.get("using")
            if using_val is None:
                return []
            if isinstance(using_val, list):
                return using_val
            if hasattr(using_val, "expressions"):
                return using_val.expressions
            if isinstance(using_val, exp.Identifier):
                return [using_val]
            return []

        assert any(
            isinstance(j, exp.Join)
            and any(
                isinstance(idn, exp.Identifier) and idn.this.lower() == "user_id"
                for idn in using_idents(j)
            )
            for j in parsed.args.get("joins", [])
        )

    def test_with_fill_simple_query(self, query_validator: QueryValidator, sample_project_id: str):
        """Test that WITH FILL queries are properly wrapped"""

        # Test query with WITH FILL
        test_query = """
SELECT
    toStartOfMinute(start_time) as time_bucket,
    COUNT(*) as span_count
FROM spans
WHERE start_time >= '2024-01-01'
GROUP BY toStartOfMinute(start_time)
ORDER BY time_bucket WITH FILL STEP INTERVAL 1 MINUTE
"""

        # Process the query
        result = query_validator.validate_and_secure_query(test_query, sample_project_id)

        assert f"FROM spans_v0(project_id = '{sample_project_id}') AS spans" in result


class TestUnqualifiedColumnValidation:
    """Test that unqualified columns are validated against the allowlist (Fix 3)"""

    def test_reject_nonexistent_unqualified_column(self, query_validator: QueryValidator, sample_project_id: str):
        """SELECT nonexistent_col FROM spans should raise QueryValidationError."""
        with pytest.raises(QueryValidationError, match="does not exist"):
            query_validator.validate_and_secure_query(
                "SELECT nonexistent_col FROM spans", sample_project_id
            )

    def test_accept_valid_unqualified_column(self, query_validator: QueryValidator, sample_project_id: str):
        """SELECT name FROM spans should pass validation."""
        result = query_validator.validate_and_secure_query(
            "SELECT name FROM spans", sample_project_id
        )
        assert "name" in result

    def test_accept_qualified_column(self, query_validator: QueryValidator, sample_project_id: str):
        """SELECT s.name FROM spans s should pass (qualified, already validated)."""
        result = query_validator.validate_and_secure_query(
            "SELECT s.name FROM spans s", sample_project_id
        )
        assert "name" in result

    def test_accept_count_star_alias(self, query_validator: QueryValidator, sample_project_id: str):
        """SELECT COUNT(*) AS total FROM spans should pass (aliased aggregate)."""
        result = query_validator.validate_and_secure_query(
            "SELECT COUNT(*) AS total FROM spans", sample_project_id
        )
        assert "total" in result

    def test_accept_cte_column_references(self, query_validator: QueryValidator, sample_project_id: str):
        """CTE queries where the outer SELECT references CTE columns should work."""
        query = """
        WITH span_counts AS (
            SELECT name, COUNT(*) as cnt
            FROM spans
            GROUP BY name
        )
        SELECT name, cnt FROM span_counts
        """
        result = query_validator.validate_and_secure_query(query, sample_project_id)
        assert "span_counts" in result

    def test_accept_alias_in_order_by(self, query_validator: QueryValidator, sample_project_id: str):
        """Aliases used in ORDER BY should not be rejected."""
        result = query_validator.validate_and_secure_query(
            "SELECT COUNT(*) AS total FROM spans ORDER BY total DESC",
            sample_project_id
        )
        assert "ORDER BY" in result

    def test_accept_alias_in_group_by(self, query_validator: QueryValidator, sample_project_id: str):
        """Aliases used in GROUP BY should work when column is in a function."""
        result = query_validator.validate_and_secure_query(
            "SELECT name, COUNT(*) AS cnt FROM spans GROUP BY name",
            sample_project_id
        )
        assert "GROUP BY" in result

    def test_accept_column_inside_function(self, query_validator: QueryValidator, sample_project_id: str):
        """Columns inside function calls should not be rejected (may be aliased)."""
        result = query_validator.validate_and_secure_query(
            "SELECT countIf(status = 'ERROR') AS err_count FROM spans",
            sample_project_id
        )
        assert "err_count" in result

    def test_reject_nonexistent_in_where_clause(self, query_validator: QueryValidator, sample_project_id: str):
        """Nonexistent column in WHERE should be rejected."""
        with pytest.raises(QueryValidationError, match="does not exist"):
            query_validator.validate_and_secure_query(
                "SELECT name FROM spans WHERE fake_col = 'test'",
                sample_project_id
            )

    def test_accept_subquery_alias_columns(self, query_validator: QueryValidator, sample_project_id: str):
        """Columns from subquery results should pass (opaque schema)."""
        query = """
        SELECT sub.cnt FROM (
            SELECT COUNT(*) AS cnt FROM spans
        ) sub
        """
        result = query_validator.validate_and_secure_query(query, sample_project_id)
        assert "cnt" in result

    def test_accept_unqualified_subquery_columns(self, query_validator: QueryValidator, sample_project_id: str):
        """Unqualified columns from subquery results should pass (opaque schema)."""
        query = """
        SELECT cnt FROM (
            SELECT COUNT(*) AS cnt FROM spans
        ) sub
        """
        result = query_validator.validate_and_secure_query(query, sample_project_id)
        assert "cnt" in result

    def test_accept_select_star(self, query_validator: QueryValidator, sample_project_id: str):
        """SELECT * should continue to work."""
        result = query_validator.validate_and_secure_query(
            "SELECT * FROM spans", sample_project_id
        )
        assert "spans_v0" in result

    def test_reject_nonexistent_with_multiple_tables(self, query_validator: QueryValidator, sample_project_id: str):
        """Unqualified column not in any joined table should be rejected."""
        with pytest.raises(QueryValidationError, match="does not exist"):
            query_validator.validate_and_secure_query(
                "SELECT fake_col FROM spans JOIN events ON spans.span_id = events.span_id",
                sample_project_id
            )

    def test_reject_nonexistent_with_aliased_table(self, query_validator: QueryValidator, sample_project_id: str):
        """Unqualified invalid column should be rejected even when the table is aliased."""
        with pytest.raises(QueryValidationError, match="does not exist"):
            query_validator.validate_and_secure_query(
                "SELECT nonexistent_col FROM spans s", sample_project_id
            )

    def test_accept_valid_column_with_aliased_table(self, query_validator: QueryValidator, sample_project_id: str):
        """Valid unqualified column should pass when the table is aliased."""
        result = query_validator.validate_and_secure_query(
            "SELECT name FROM spans s", sample_project_id
        )
        assert "name" in result


class TestExpandedBlockedFunctions:
    """Test that newly blocked functions are properly rejected (Fix 4)"""

    def test_reject_deltalake(self, query_validator: QueryValidator, sample_project_id: str):
        with pytest.raises(QueryValidationError, match="not allowed"):
            query_validator.validate_and_secure_query(
                "SELECT * FROM deltaLake('s3://bucket/path')", sample_project_id
            )

    def test_reject_iceberg(self, query_validator: QueryValidator, sample_project_id: str):
        with pytest.raises(QueryValidationError, match="not allowed"):
            query_validator.validate_and_secure_query(
                "SELECT * FROM iceberg('s3://bucket/path')", sample_project_id
            )

    def test_reject_hudi(self, query_validator: QueryValidator, sample_project_id: str):
        with pytest.raises(QueryValidationError, match="not allowed"):
            query_validator.validate_and_secure_query(
                "SELECT * FROM hudi('s3://bucket/path')", sample_project_id
            )

    def test_reject_format(self, query_validator: QueryValidator, sample_project_id: str):
        with pytest.raises(QueryValidationError, match="not allowed"):
            query_validator.validate_and_secure_query(
                "SELECT * FROM format('CSV', '1,2,3')", sample_project_id
            )

    def test_reject_urlcluster(self, query_validator: QueryValidator, sample_project_id: str):
        with pytest.raises(QueryValidationError, match="not allowed"):
            query_validator.validate_and_secure_query(
                "SELECT * FROM urlCluster('cluster', 'http://evil.com')", sample_project_id
            )

    def test_reject_s3queue(self, query_validator: QueryValidator, sample_project_id: str):
        with pytest.raises(QueryValidationError, match="not allowed"):
            query_validator.validate_and_secure_query(
                "SELECT * FROM s3Queue('s3://bucket/path')", sample_project_id
            )

    def test_reject_hive(self, query_validator: QueryValidator, sample_project_id: str):
        with pytest.raises(QueryValidationError, match="not allowed"):
            query_validator.validate_and_secure_query(
                "SELECT * FROM hive('thrift://host:9083', 'db', 'table')", sample_project_id
            )

    def test_reject_currentdatabase(self, query_validator: QueryValidator, sample_project_id: str):
        with pytest.raises(QueryValidationError, match="not allowed"):
            query_validator.validate_and_secure_query(
                "SELECT currentDatabase() FROM spans", sample_project_id
            )

    def test_reject_hostname(self, query_validator: QueryValidator, sample_project_id: str):
        with pytest.raises(QueryValidationError, match="not allowed"):
            query_validator.validate_and_secure_query(
                "SELECT hostName() FROM spans", sample_project_id
            )

    def test_reject_version(self, query_validator: QueryValidator, sample_project_id: str):
        with pytest.raises(QueryValidationError, match="not allowed"):
            query_validator.validate_and_secure_query(
                "SELECT version() FROM spans", sample_project_id
            )

    def test_reject_uptime(self, query_validator: QueryValidator, sample_project_id: str):
        with pytest.raises(QueryValidationError, match="not allowed"):
            query_validator.validate_and_secure_query(
                "SELECT uptime() FROM spans", sample_project_id
            )

    def test_reject_getmacro(self, query_validator: QueryValidator, sample_project_id: str):
        with pytest.raises(QueryValidationError, match="not allowed"):
            query_validator.validate_and_secure_query(
                "SELECT getMacro('key') FROM spans", sample_project_id
            )

    def test_existing_safe_functions_still_allowed(self, query_validator: QueryValidator, sample_project_id: str):
        """Ensure no false positives on safe functions."""
        safe_queries = [
            "SELECT count(*) FROM spans",
            "SELECT sum(total_cost) FROM spans",
            "SELECT avg(duration) FROM spans",
            "SELECT min(start_time), max(end_time) FROM spans",
            "SELECT toStartOfInterval(start_time, INTERVAL 5 MINUTE) AS t FROM spans",
            "SELECT quantile(0.9)(duration) FROM spans",
            "SELECT countIf(status = 'ERROR') FROM spans",
        ]
        for query in safe_queries:
            result = query_validator.validate_and_secure_query(query, sample_project_id)
            assert "spans_v0" in result


class TestEndToEndHardening:
    """End-to-end tests combining JSON->SQL conversion with query validation.

    These tests verify the complete pipeline: JSON filter spec -> SQL generation
    -> AST validation and rewriting.
    """

    def test_e2e_quote_in_filter_value(self, query_validator: QueryValidator, sample_project_id: str):
        """Filter with O'Brien should produce valid, validated SQL."""
        from src.json_to_sql import convert_json_to_sql
        query_json = {
            "table": "spans",
            "metrics": [{"fn": "COUNT", "column": "*", "alias": "total"}],
            "filters": [
                {"field": "name", "op": "eq", "string_value": "O'Brien"},
                {"field": "start_time", "op": "gte", "string_value": "{start_time:DateTime64}"},
                {"field": "start_time", "op": "lte", "string_value": "{end_time:DateTime64}"}
            ],
        }
        sql = convert_json_to_sql(query_json)
        result = query_validator.validate_and_secure_query(sql, sample_project_id)
        assert "O''Brien" in result

    def test_e2e_valid_query_with_limit(self, query_validator: QueryValidator, sample_project_id: str):
        """Full pipeline: JSON -> SQL -> validated query with limit."""
        from src.json_to_sql import convert_json_to_sql
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
        result = query_validator.validate_and_secure_query(sql, sample_project_id)
        assert "LIMIT 5" in result
        assert "spans_v0" in result

    def test_e2e_time_series_with_model_filter(self, query_validator: QueryValidator, sample_project_id: str):
        """Full pipeline: time series query with filters through validation."""
        from src.json_to_sql import convert_json_to_sql
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
            "metrics": [{"fn": "COUNT", "column": "*", "alias": "value"}],
            "filters": [
                {"field": "model", "op": "ne", "string_value": "<null>"},
                {"field": "span_type", "op": "eq", "string_value": "LLM"}
            ]
        }
        sql = convert_json_to_sql(query_json)
        result = query_validator.validate_and_secure_query(sql, sample_project_id)
        assert "spans_v0" in result
        assert "WITH FILL" in result

    def test_e2e_malicious_field_sanitized(self, query_validator: QueryValidator, sample_project_id: str):
        """Malicious field name is sanitized via AST round-trip, then fails validation.
        The _safe_column_expr neutralizes injected SQL by parsing and regenerating."""
        from src.json_to_sql import convert_json_to_sql
        query_json = {
            "table": "spans",
            "metrics": [{"fn": "COUNT", "column": "*", "alias": "total"}],
            "filters": [
                {"field": "1=1; DROP TABLE spans --", "op": "eq", "string_value": "x"},
            ],
        }
        # This produces sanitized SQL (the injection is neutralized by AST round-trip)
        sql = convert_json_to_sql(query_json)
        # The DROP TABLE is removed by the AST parser; the expression becomes "1 = 1"
        assert "DROP" not in sql

    def test_e2e_malformed_field_raises(self, sample_project_id: str):
        """Completely malformed field name should raise at JSON->SQL stage."""
        from src.json_to_sql import convert_json_to_sql, QueryBuilderError
        query_json = {
            "table": "spans",
            "metrics": [{"fn": "COUNT", "column": "*", "alias": "total"}],
            "filters": [
                {"field": ")))INVALID(((", "op": "eq", "string_value": "x"},
            ],
        }
        with pytest.raises(QueryBuilderError):
            convert_json_to_sql(query_json)

    def test_e2e_malicious_limit_blocked(self, sample_project_id: str):
        """Malicious limit should be blocked at JSON->SQL stage."""
        from src.json_to_sql import convert_json_to_sql, QueryBuilderError
        query_json = {
            "table": "spans",
            "metrics": [{"fn": "COUNT", "column": "*", "alias": "total"}],
            "dimensions": ["name"],
            "limit": "10; DROP TABLE spans"
        }
        with pytest.raises(QueryBuilderError, match="LIMIT must be a positive integer"):
            convert_json_to_sql(query_json)

    def test_e2e_blocked_function_in_raw_metric(self, sample_project_id: str):
        """Newly blocked functions should be rejected in raw metrics too."""
        from src.json_to_sql import convert_json_to_sql, QueryBuilderError
        for func in ["deltaLake", "iceberg", "hudi", "urlCluster", "s3Queue", "hive"]:
            query_json = {
                "table": "spans",
                "metrics": [{"fn": "raw", "column": f"{func}('evil')", "alias": "bad"}],
                "dimensions": ["name"],
            }
            with pytest.raises(QueryBuilderError, match="not allowed"):
                convert_json_to_sql(query_json)

    def test_e2e_unqualified_invalid_column_rejected(self, query_validator: QueryValidator, sample_project_id: str):
        """Unqualified invalid column in a hand-written query should be rejected."""
        with pytest.raises(QueryValidationError, match="does not exist"):
            query_validator.validate_and_secure_query(
                "SELECT name, fake_column FROM spans", sample_project_id
            )

    def test_e2e_complex_cte_with_traces_and_spans(self, query_validator: QueryValidator, sample_project_id: str):
        """Complex CTE joining traces and spans should pass validation."""
        query = """
        WITH trace_data AS (
            SELECT id, duration, user_id
            FROM traces
            WHERE start_time >= '2024-01-01' AND start_time < '2024-02-01'
        ),
        span_data AS (
            SELECT trace_id, name, duration
            FROM spans
            WHERE start_time >= '2024-01-01' AND start_time < '2024-02-01'
        )
        SELECT * FROM trace_data
        LEFT JOIN span_data ON trace_data.id = span_data.trace_id
        """
        result = query_validator.validate_and_secure_query(query, sample_project_id)
        assert "traces_v0" in result
        assert "spans_v0" in result


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
