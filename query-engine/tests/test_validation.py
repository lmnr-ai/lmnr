import pytest
import pandas as pd
from unittest.mock import Mock
from sqlglot import parse_one, exp

from src.query_validator import (
    QueryValidator,
    TableRegistry,
    TableSchema,
    QueryValidationError,
    validate_and_secure_query
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

@pytest.fixture
def mock_clickhouse_client():
    """Mock ClickHouse client that returns sample data"""
    client = Mock()
    
    # Sample spans data
    spans_df = pd.DataFrame({
        'span_id': ['span1', 'span2', 'span3'],
        'trace_id': ['trace1', 'trace1', 'trace2'],
        'start_time': ['2024-01-01 10:00:00', '2024-01-01 10:01:00', '2024-01-01 10:02:00'],
        'end_time': ['2024-01-01 10:00:30', '2024-01-01 10:01:30', '2024-01-01 10:02:30'],
        'span_name': ['test_span_1', 'test_span_2', 'test_span_3']
    })
    
    def mock_query_df(query, parameters=None):
        return spans_df
    
    client.query_df = mock_query_df
    return client


class TestTableRegistry:
    """Test the TableRegistry class"""
    
    def test_default_tables_registered(self, table_registry: TableRegistry):
        """Test that default tables (spans, traces) are registered"""
        assert table_registry.is_table_allowed('spans')
        assert table_registry.is_table_allowed('traces')
        assert not table_registry.is_table_allowed('unknown_table')
    
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
        assert 'trace_id' in traces_schema.allowed_columns
        assert 'start_time' in traces_schema.allowed_columns
        assert traces_schema.time_column == 'start_time'
    
    def test_column_validation(self, table_registry: TableRegistry):
        """Test column validation for tables"""
        spans_schema = table_registry.get_table_schema('spans')
        assert spans_schema.is_column_allowed('span_id')
        assert spans_schema.is_column_allowed('SPAN_ID')  # Case insensitive
        assert not spans_schema.is_column_allowed('invalid_column')
    
    def test_register_custom_table(self, table_registry: TableRegistry):
        """Test registering a custom table"""
        custom_schema = TableSchema('custom_table', {'id', 'name', 'created_at'}, 'created_at')
        table_registry.register_table(custom_schema)
        
        assert table_registry.is_table_allowed('custom_table')
        schema = table_registry.get_table_schema('custom_table')
        assert schema.is_column_allowed('name')
        assert not schema.is_column_allowed('invalid_column')


class TestQueryValidator:
    """Test the QueryValidator class"""
    
    def test_validate_basic_select(self, query_validator: QueryValidator, sample_project_id: str):
        """Test validation of basic SELECT query"""
        query = "SELECT span_id, span_name FROM spans"
        result = query_validator.validate_and_secure_query(query, sample_project_id)
        
        # Should contain project_id filter and traces CTE
        assert f"project_id = '{sample_project_id}'" in result
        assert "WITH traces" in result
        assert "FROM spans" in result
    
    def test_validate_traces_query(self, query_validator: QueryValidator, sample_project_id: str):
        """Test validation of traces query"""
        query = "SELECT trace_id, start_time FROM traces"
        result = query_validator.validate_and_secure_query(query, sample_project_id)
        
        assert "WITH traces" in result
        assert "FROM traces" in result
    
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
        ]
        
        for query in write_queries:
            with pytest.raises(QueryValidationError, match="Only SELECT statements are allowed"):
                query_validator.validate_and_secure_query(query, sample_project_id)
    
    def test_reject_non_select(self, query_validator: QueryValidator, sample_project_id: str):
        """Test that non-SELECT statements are rejected"""
        with pytest.raises(QueryValidationError, match="Only SELECT statements are allowed"):
            query_validator.validate_and_secure_query("SHOW TABLES", sample_project_id)

    def test_reject_unknown_table(self, query_validator: QueryValidator, sample_project_id: str):
        """Test that unknown tables are rejected"""
        with pytest.raises(QueryValidationError, match="not allowed"):
            query_validator.validate_and_secure_query("SELECT * FROM unknown_table", sample_project_id)

    def test_reject_ch_system_tables(self, query_validator: QueryValidator, sample_project_id: str):
        """Test that unknown tables are rejected"""
        with pytest.raises(QueryValidationError, match="not allowed"):
            query_validator.validate_and_secure_query("SELECT * FROM system.users", sample_project_id)

    def test_reject_project_id_access(self, query_validator: QueryValidator, sample_project_id: str):
        """Test that direct project_id access is rejected"""
        with pytest.raises(QueryValidationError, match="Column 'project_id' does not exist"):
            query_validator.validate_and_secure_query("SELECT span_id, project_id FROM spans", sample_project_id)

    def test_reject_invalid_column(self, query_validator: QueryValidator, sample_project_id: str):
        """Test that invalid columns are rejected"""
        with pytest.raises(QueryValidationError, match="Column 'invalid_column' does not exist"):
            query_validator.validate_and_secure_query("SELECT spans.invalid_column FROM spans", sample_project_id)

    def test_add_project_id_filter_new_query(self, query_validator: QueryValidator, sample_project_id: str):
        """Test adding project_id filter to query without WHERE clause"""
        query = "SELECT span_id FROM spans"
        result = query_validator.validate_and_secure_query(query, sample_project_id)

        # Should add project_id filter
        assert f"project_id = '{sample_project_id}'" in result

    def test_add_project_id_filter_existing_where(self, query_validator: QueryValidator, sample_project_id: str):
        """Test adding project_id filter to query with existing WHERE clause"""
        query = "SELECT span_id FROM spans WHERE span_name = 'test'"
        result = query_validator.validate_and_secure_query(query, sample_project_id)

        # Should combine conditions with AND
        assert f"project_id = '{sample_project_id}'" in result
        assert "span_name = 'test'" in result
        assert "AND" in result

    def test_secure_cte_with_spans(self, query_validator: QueryValidator, sample_project_id: str):
        """Test securing CTE that queries spans table"""
        query = """
        WITH span_stats AS (
            SELECT span_id, COUNT(*) as count
            FROM spans
            GROUP BY span_id
        )
        SELECT * FROM span_stats
        """
        result = query_validator.validate_and_secure_query(query, sample_project_id)
        # CTE should be secured with project_id
        assert """WITH span_stats AS (
  SELECT
    span_id,
    COUNT(*) AS count,
    project_id
  FROM spans
  WHERE
    project_id = 'test-project-123'
  GROUP BY
    span_id,
    project_id
)""" in result
        

    def test_secure_spans_flat_subquery(self, query_validator: QueryValidator, sample_project_id: str):
        """Test securing spans flattened CTE"""
        query = """
SELECT * FROM (
    SELECT span_id, COUNT(*) as count
    FROM spans
    GROUP BY span_id
) span_stats
        """
        result = query_validator.validate_and_secure_query(query, sample_project_id)
        print(result)
        assert """
FROM (
  SELECT
    span_id,
    COUNT(*) AS count
  FROM spans
  WHERE
    project_id = 'test-project-123'
  GROUP BY
    span_id,
    project_id
) AS span_stats
""" in result

    def test_time_filter_pushdown(self, query_validator: QueryValidator, sample_project_id: str):
        """Test time filter pushdown to traces CTE"""
        query = "SELECT * FROM traces WHERE start_time > '2024-01-01'"
        result = query_validator.validate_and_secure_query(query, sample_project_id)

        # Time filter should be pushed down to CTE
        lines = result.split('\n')
        cte_section = []
        in_cte = False
        for line in lines:
            if 'WITH traces' in line:
                in_cte = True
            elif in_cte and 'FROM traces' in line:
                break
            if in_cte:
                cte_section.append(line)
        
        cte_text = '\n'.join(cte_section)
        assert "start_time > '2024-01-01'" in cte_text
    
    def test_traces_cte_columns(self, query_validator: QueryValidator, sample_project_id: str):
        """Test that traces CTE has all expected columns"""
        query = "SELECT trace_id FROM spans"
        result = query_validator.validate_and_secure_query(query, sample_project_id)

        # Check for expected trace columns in CTE definition
        expected_columns = [
            "trace_start_time", "trace_end_time", "input_tokens", "output_tokens",
            "total_tokens", "input_cost", "output_cost", "total_cost", "duration",
            "metadata", "session_id", "user_id", "status", "trace_type", "trace_id"
        ]

        for column in expected_columns:
            assert column in result
    
    def test_aggregation_with_group_by(self, query_validator: QueryValidator, sample_project_id: str):
        """Test CTE with aggregation functions gets proper GROUP BY"""
        query = """
        WITH span_counts AS (
            SELECT COUNT(*) as cnt, trace_id
            FROM spans
            GROUP BY trace_id
        )
        SELECT * FROM span_counts
        """
        result = query_validator.validate_and_secure_query(query, sample_project_id)
        # Should add project_id to GROUP BY in CTE
        assert """WITH span_counts AS (
  SELECT
    COUNT(*) AS cnt,
    trace_id,
    project_id
  FROM spans
  WHERE
    project_id = 'test-project-123'
  GROUP BY
    trace_id,
    project_id
)""" in result


class TestSecurityValidation:
    """Test security validation edge cases"""

    def test_complex_nested_query(self, query_validator: QueryValidator, sample_project_id: str):
        """Test complex nested query validation"""
        query = """
        SELECT s1.span_id, s1.start_time
        FROM spans s1
        WHERE s1.trace_id IN (
            SELECT trace_id 
            FROM spans s2 
            WHERE s2.span_name = 'test'
        )
        """
        result = query_validator.validate_and_secure_query(query, sample_project_id)

        # All spans references should be secured
        project_filter_count = result.count(f"project_id = '{sample_project_id}'")
        assert project_filter_count >= 2  # Main query and subquery

    def test_join_with_allowed_tables(self, query_validator: QueryValidator, sample_project_id: str):
        """Test JOIN between allowed tables"""
        query = """
        SELECT s.span_id, t.trace_id
        FROM spans s
        JOIN traces t ON s.trace_id = t.trace_id
        """
        result = query_validator.validate_and_secure_query(query, sample_project_id)

        # Should work and add project_id filters
        assert f"project_id = '{sample_project_id}'" in result
        assert "JOIN traces" in result


class TestConvenienceFunction:
    """Test the convenience function"""

    def test_validate_and_secure_query_function(self, sample_project_id: str):
        """Test the convenience function"""
        query = "SELECT span_id FROM spans"
        result = validate_and_secure_query(query, sample_project_id)

        assert f"project_id = '{sample_project_id}'" in result
        assert "WITH traces" in result

    def test_convenience_function_error_handling(self, sample_project_id: str):
        """Test error handling in convenience function"""
        with pytest.raises(QueryValidationError):
            validate_and_secure_query("INSERT INTO spans VALUES (1)", sample_project_id)


class TestExpectedQueryTransformations:
    """Test expected query transformations with specific examples"""

    def test_spans_time_range_query(self, query_validator: QueryValidator, sample_project_id: str):
        """Test spans time range query - time filters should NOT be pushed to traces CTE"""
        input_query = "SELECT start_time FROM spans WHERE start_time > now() - interval '1 hour' LIMIT 1"
        result = query_validator.validate_and_secure_query(input_query, sample_project_id)
        # Should have project_id filter in main query
        assert f"project_id = '{sample_project_id}'" in result

        # Main query should have the original time filter preserved
        main_query_part = result.split("FROM spans")[-1]  # Get the main query part
        assert "start_time > now() - INTERVAL '1' HOUR" in main_query_part

        # Should have SELECT start_time (not span_id, span_name)
        assert "SELECT\n  start_time\nFROM spans" in result

        # Should have LIMIT 1
        assert "LIMIT 1" in result

    def test_traces_time_range_query_with_pushdown(self, query_validator: QueryValidator, sample_project_id: str):
        """Test traces time range query - time filters SHOULD be pushed to traces CTE"""
        input_query = "SELECT trace_id, duration FROM traces WHERE start_time > '2024-01-01' AND end_time < '2024-01-02'"
        result = query_validator.validate_and_secure_query(input_query, sample_project_id)
        # Should have project_id filter
        assert f"project_id = '{sample_project_id}'" in result

        # Time filters should be pushed down to the traces CTE
        cte_part = result.split("FROM traces")[0]  # Get CTE part
        assert "start_time > '2024-01-01'" in cte_part
        assert "end_time < '2024-01-02'" in cte_part

        # Should NOT have the default 720-hour window since we have specific time filters
        assert "720 HOUR" not in cte_part

        # Main query should have the time filters removed (they were pushed down)
        main_query_part = result.split("FROM traces")[-1]  # Get main query part
        # The time filters should not appear in the main query's WHERE clause
        lines_after_where = []
        in_main_where = False
        for line in main_query_part.split('\n'):
            if 'WHERE' in line:
                in_main_where = True
            elif in_main_where and (line.strip() == ''):
                break
            elif in_main_where:
                lines_after_where.append(line)

        main_where_clause = '\n'.join(lines_after_where)
        # Time filters should not be in main WHERE since they were pushed down
        assert "start_time > '2024-01-01'" not in main_where_clause
        assert "end_time < '2024-01-02'" not in main_where_clause

    def test_basic_spans_query_transformation(self, query_validator: QueryValidator, sample_project_id: str):
        """Test basic spans query transformation"""
        input_query = "SELECT span_id, span_name FROM spans"
        result = query_validator.validate_and_secure_query(input_query, sample_project_id)

        # Should have project_id filter and traces CTE
        assert f"project_id = '{sample_project_id}'" in result
        assert "WITH traces" in result
        assert "FROM spans" in result

        # Parse to ensure it's valid SQL
        parsed = parse_one(result, read="clickhouse")
        assert isinstance(parsed, exp.Select)

    def test_traces_query_transformation(self, query_validator: QueryValidator, sample_project_id: str):
        """Test traces query transformation"""
        input_query = "SELECT trace_id, duration FROM traces WHERE start_time > '2024-01-01'"
        result = query_validator.validate_and_secure_query(input_query, sample_project_id)
        # Should have traces CTE with time filter pushed down
        assert f"""WITH traces(start_time, end_time, input_tokens, output_tokens, total_tokens, input_cost, output_cost, total_cost, duration, metadata, session_id, user_id, status, top_span_id, trace_type, trace_id, project_id) AS (
  SELECT
    MIN(start_time) AS trace_start_time,
    MAX(end_time) AS trace_end_time,
    SUM(input_tokens) AS input_tokens,
    SUM(output_tokens) AS output_tokens,
    SUM(total_tokens) AS total_tokens,
    SUM(input_cost) AS input_cost,
    SUM(output_cost) AS output_cost,
    SUM(total_cost) AS total_cost,
    MAX(end_time) - MIN(start_time) AS duration,
    argMax(trace_metadata, LENGTH(trace_metadata)) AS metadata,
    anyIf(session_id, session_id <> '<null>' AND session_id <> '') AS session_id,
    anyIf(user_id, user_id <> '<null>' AND user_id <> '') AS user_id,
    anyIf(status, status <> '<null>' AND status <> '') AS status,
    anyIf(span_id, parent_span_id = '00000000-0000-0000-0000-000000000000') AS top_span_id,
    CASE WHEN countIf(span_type IN (3, 4, 5)) > 0 THEN 2 ELSE 0 END AS trace_type,
    trace_id,
    project_id
  FROM spans
  WHERE
    project_id = '{sample_project_id}' AND start_time > '2024-01-01'
  GROUP BY
    trace_id,
    project_id
)""" in result
        
        # Parse to ensure it's valid SQL
        parsed = parse_one(result, read="clickhouse")
        assert isinstance(parsed, exp.Select)
    
    def test_complex_query_with_aggregation(self, query_validator: QueryValidator, sample_project_id: str):
        """Test complex query with aggregation"""
        input_query = """
        SELECT 
            trace_id,
            COUNT(*) as span_count,
            AVG(total_cost) as avg_cost
        FROM spans 
        WHERE start_time > '2024-01-01'
        GROUP BY trace_id
        """
        result = query_validator.validate_and_secure_query(input_query, sample_project_id)
        
        # Should add project_id to GROUP BY
        assert """GROUP BY
    trace_id,
    project_id""" in result
        assert f"project_id = '{sample_project_id}'" in result
        
        # Parse to ensure it's valid SQL  
        parsed = parse_one(result, read="clickhouse")
        assert isinstance(parsed, exp.Select)

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
  (
    start_time >= {start_time: DateTime64} AND start_time <= {end_time: DateTime64}
  )
  AND project_id = 'test-project-123'""" in result
        
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
  (
    model <> '<null>'
    AND span_type IN (0, 1)
    AND start_time >= {start_time: DateTime64}
    AND start_time <= {end_time: DateTime64}
  )
  AND project_id = 'test-project-123'""" in result
        assert """WITH FILL FROM (
    toStartOfInterval({start_time: DateTime64}, INTERVAL '5' MINUTE)
  ) TO (
    toStartOfInterval({start_time: DateTime64}, INTERVAL '5' MINUTE)
  )""" in result
        
    def test_simple_evaluation_scores_query(self, query_validator: QueryValidator, sample_project_id: str):
        """Test simple evaluation scores query"""
        input_query = """
        SELECT * FROM evaluation_scores
        """
        result = query_validator.validate_and_secure_query(input_query, sample_project_id)
        assert f"""SELECT
  *
FROM evaluation_scores
WHERE
  project_id = '{sample_project_id}'""" in result
        
    def test_simplpe_evaluation_datapoints_query(self, query_validator: QueryValidator, sample_project_id: str):
        """Test evaluation scores query"""
        input_query = """
        SELECT * FROM evaluation_datapoints
        """
        result = query_validator.validate_and_secure_query(input_query, sample_project_id)
        assert f"""SELECT
  *
FROM evaluation_datapoints
WHERE
  project_id = '{sample_project_id}'""" in result
        
    def test_simple_events_query(self, query_validator: QueryValidator, sample_project_id: str):
        """Test events query"""
        input_query = """
        SELECT * FROM events
        """
        result = query_validator.validate_and_secure_query(input_query, sample_project_id)
        assert f"""SELECT
  *
FROM events
WHERE
  project_id = '{sample_project_id}'""" in result
        
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
        print(result)
        assert """SELECT
  toStartOfMinute(start_time) AS time_bucket,
  COUNT(*) AS span_count
FROM spans
WHERE
  start_time >= '2024-01-01' AND project_id = 'test-project-123'
GROUP BY
  toStartOfMinute(start_time)
ORDER BY
  time_bucket WITH FILL STEP INTERVAL '1' MINUTE""" in result
        

    def test_with_fill_trace_status_query(self, query_validator: QueryValidator, sample_project_id: str):
        """Test that WITH FILL queries are properly wrapped"""

        # Test query with WITH FILL
        test_query = """
SELECT
    time,
    CASE 
        WHEN status = 'error' THEN 'error'
        ELSE 'success'
    END AS trace_status,
    value
FROM (
    SELECT
        toStartOfInterval(start_time, toInterval({interval_number:Int8}, {interval_unit:String})) AS time,
        status,
        count() AS value
    FROM traces
    WHERE
        start_time >= {start_time:DateTime64}
        AND start_time <= {end_time:DateTime64}
        AND trace_type = 0
        AND status IN ('', 'error')
    GROUP BY time, status
    ORDER BY time
    WITH FILL
    FROM toStartOfInterval({start_time:DateTime64}, toInterval({interval_number:Int8}, {interval_unit:String}))
    TO toStartOfInterval({end_time:DateTime64}, toInterval({interval_number:Int8}, {interval_unit:String}))
    STEP toInterval({interval_number:Int8}, {interval_unit:String})
)
ORDER BY time, trace_status
"""

        # Process the query
        result = query_validator.validate_and_secure_query(test_query, sample_project_id)

        # Verify the result has the expected structure
        parsed = parse_one(result, read="clickhouse")

        # Check that our parser adds a subquery (+1 to an existing one)
        assert len(list(parsed.find_all(exp.Subquery))) == 2

        assert """SELECT
    *,
    'test-project-123' AS project_id
  FROM (
    SELECT
      toStartOfInterval(start_time, toInterval({interval_number: Int8}, {interval_unit: String})) AS time,
      status,
      count() AS value
    FROM traces
    WHERE
      (
        start_time >= {start_time: DateTime64}
        AND start_time <= {end_time: DateTime64}
        AND trace_type = 0
        AND status IN ('', 'error')
      )
      AND project_id = 'test-project-123'
    GROUP BY
      time,
      status
    ORDER BY
      time WITH FILL FROM toStartOfInterval(
        {start_time: DateTime64},
        toInterval({interval_number: Int8}, {interval_unit: String})
      ) TO toStartOfInterval(
        {end_time: DateTime64},
        toInterval({interval_number: Int8}, {interval_unit: String})
      ) STEP toInterval({interval_number: Int8}, {interval_unit: String})
  )""" in result
        
    def test_with_fill_trace_status_query_with_cte(self, query_validator: QueryValidator, sample_project_id: str):

        # Test query with WITH FILL
        test_query = """
WITH status_cte AS (
    SELECT
        toStartOfInterval(start_time, toInterval({interval_number:Int8}, {interval_unit:String})) AS time,
        status,
        count() AS value
    FROM traces
    WHERE
        start_time >= {start_time:DateTime64}
        AND start_time <= {end_time:DateTime64}
        AND trace_type = 0
        AND status IN ('', 'error')
    GROUP BY time, status
    ORDER BY time
    WITH FILL
    FROM toStartOfInterval({start_time:DateTime64}, toInterval({interval_number:Int8}, {interval_unit:String}))
    TO toStartOfInterval({end_time:DateTime64}, toInterval({interval_number:Int8}, {interval_unit:String}))
    STEP toInterval({interval_number:Int8}, {interval_unit:String})
)
SELECT
    time,
    CASE 
        WHEN status = 'error' THEN 'error'
        ELSE 'success'
    END AS trace_status,
    value
FROM status_cte
ORDER BY time, trace_status
"""

        # Process the query
        result = query_validator.validate_and_secure_query(test_query, sample_project_id)
        print(result)
        assert """status_cte AS (
  SELECT
    *,
    'test-project-123' AS project_id
  FROM (
    SELECT
      toStartOfInterval(start_time, toInterval({interval_number: Int8}, {interval_unit: String})) AS time,
      status,
      count() AS value
    FROM traces
    WHERE
      (
        start_time >= {start_time: DateTime64}
        AND start_time <= {end_time: DateTime64}
        AND trace_type = 0
        AND status IN ('', 'error')
      )
      AND project_id = 'test-project-123'
    GROUP BY
      time,
      status
    ORDER BY
      time WITH FILL FROM toStartOfInterval(
        {start_time: DateTime64},
        toInterval({interval_number: Int8}, {interval_unit: String})
      ) TO toStartOfInterval(
        {end_time: DateTime64},
        toInterval({interval_number: Int8}, {interval_unit: String})
      ) STEP toInterval({interval_number: Int8}, {interval_unit: String})
  )
)""" in result


if __name__ == "__main__":
    pytest.main([__file__, "-v"])