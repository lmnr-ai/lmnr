"""
Query Validation Module

This module provides secure query validation and rewriting for a multi-tenant ClickHouse environment
using virtual views (table functions) approach. It replaces table references with their corresponding
_v0 view functions that handle project-level filtering automatically.
"""
import sqlglot

from dataclasses import dataclass


VIEW_VERSION = "v0"

@dataclass
class TableSchema:
    """Defines the schema for an allowed table"""
    name: str
    allowed_columns: set[str]
    time_column: str | None = None

    def is_column_allowed(self, column: str) -> bool:
        """Check if a column is allowed for this table"""
        return column.lower() in {col.lower() for col in self.allowed_columns}


class TableRegistry:
    """Registry of allowed tables and their schemas"""

    def __init__(self):
        self.tables: dict[str, TableSchema] = {}
        self._setup_default_tables()

    def _setup_default_tables(self):
        """setup default tables"""
        spans_columns = {
            'span_id', 'status', 'name', 'path', 'parent_span_id', 'span_type',
            'start_time', 'end_time', 'duration', 'input', 'output', 'request_model',
            'response_model', 'model', 'provider', 'input_tokens', 'output_tokens',
            'total_tokens', 'input_cost', 'output_cost', 'total_cost', 'attributes',
            'trace_id', 'tags',
        }

        traces_columns = {
            'id', 'trace_type', 'metadata', 'start_time', 'end_time',
            'duration', 'input_tokens', 'output_tokens', 'total_tokens',
            'input_cost', 'output_cost', 'total_cost', 'status', 'user_id',
            'session_id', 'top_span_id', 'top_span_name', 'top_span_type', 'tags',
        }

        dataset_datapoints_columns = {
            "id", "created_at", "dataset_id", "data", "target", "metadata",
        }

        evaluation_datapoints_columns = {
            "id", "evaluation_id", "trace_id", "created_at", "data", "target",
            "metadata", "executor_output", "index", "group_id", "scores",
        }

        events_columns = {
            "id", "span_id", "name", "timestamp", "attributes", "trace_id",
            "user_id", "session_id",
        }

        tags_columns = {
            "id", "span_id", "name", "created_at", "source",
        }

        self.tables['spans'] = TableSchema('spans', spans_columns, 'start_time')
        self.tables['traces'] = TableSchema('traces', traces_columns, 'start_time')
        self.tables['dataset_datapoints'] = TableSchema('dataset_datapoints', dataset_datapoints_columns, 'created_at')
        # same as dataset_datapoints, but dataset_datapoints_v0 view only exposes
        # the latest version of each datapoint
        self.tables['dataset_datapoint_versions'] = TableSchema('dataset_datapoint_versions', dataset_datapoints_columns, 'created_at')
        self.tables['evaluation_datapoints'] = TableSchema('evaluation_datapoints', evaluation_datapoints_columns, 'created_at')
        self.tables['events'] = TableSchema('events', events_columns, 'timestamp')
        self.tables['tags'] = TableSchema('tags', tags_columns, 'created_at')

    def is_table_allowed(self, table_name: str) -> bool:
        """Check if a table is allowed"""
        return table_name.lower() in self.tables

    def get_table_schema(self, table_name: str) -> TableSchema | None:
        """Get schema for a table"""
        return self.tables.get(table_name.lower())

    def get_allowed_tables(self) -> set[str]:
        """Get set of all allowed table names"""
        return set(self.tables.keys())


class QueryValidationError(Exception):
    """Exception raised when query validation fails"""
    pass


class QueryValidator:
    """Main query validator and rewriter"""

    def __init__(self, table_registry: TableRegistry | None = None):
        self.table_registry = table_registry or TableRegistry()


    def validate_and_secure_query(self, sql_query: str, project_id: str) -> str:
        """
        Main entry point: validates and secures a SQL query using virtual views

        Args:
            sql_query: The user's SQL query
            project_id: The project ID to filter by

        Returns:
            Secured and rewritten SQL query with view functions

        Raises:
            QueryValidationError: If query is invalid or unsafe
        """
        try:
            parsed = sqlglot.parse_one(sql_query, read="clickhouse")

            # Security validation
            self._validate_security(parsed)

            # Table and column validation
            self._validate_tables_and_columns(parsed)

            # Replace table references with view functions
            parsed = self._replace_tables_with_views(parsed, project_id)

            parsed = self._strip_settings_clause(parsed)

            # Convert back to SQL
            result = parsed.sql(dialect="clickhouse", pretty=True)
            return result

        except QueryValidationError:
            raise
        except Exception as e:
            raise QueryValidationError(f"Query validation failed: {str(e)}")

    def _validate_security(self, query: sqlglot.exp.Expression):
        """Validate that query is secure (only SELECT, no writes)"""
        if not isinstance(query, sqlglot.exp.Select):
            raise QueryValidationError("Only SELECT statements are allowed")

        # Check for any write operations
        for node in query.find_all(sqlglot.exp.Update, sqlglot.exp.Insert, sqlglot.exp.Delete):
            raise QueryValidationError(f"{type(node).__name__} statements are not allowed")

    def _validate_tables_and_columns(self, query: sqlglot.exp.Expression):
        """Validate that all tables and columns are allowed"""
        # Check all table references
        for table in query.find_all(sqlglot.exp.Table):
            table_name = table.name.lower()

            # Skip if it's a CTE reference
            if self._is_cte_reference(query, table):
                continue

            if not self.table_registry.is_table_allowed(table_name):
                raise QueryValidationError(f"Table '{table_name}' is not allowed")

        # Check all column references
        for column in query.find_all(sqlglot.exp.Column):
            self._validate_column_access(query, column)

    def _validate_column_access(self, query: sqlglot.exp.Expression, column: sqlglot.exp.Column):
        """Validate that a column access is allowed"""
        column_name = column.this.name if column.this else None
        if not column_name:
            return

        # project_id is never allowed in user queries
        if column_name.lower() == 'project_id':
            raise QueryValidationError("Column 'project_id' does not exist")

        # If column has a table qualifier, validate it
        if column.table:
            table_name = column.table.lower()
            schema = self.table_registry.get_table_schema(table_name)
            if schema and not schema.is_column_allowed(column_name):
                raise QueryValidationError(f"Column '{column_name}' does not exist")

    def _is_cte_reference(self, query: sqlglot.exp.Expression, table: sqlglot.exp.Table) -> bool:
        """Check if a table reference is actually a CTE"""
        if not query.args.get("with"):
            return False

        cte_names = {cte.alias.lower() for cte in query.args["with"].expressions}
        return table.name.lower() in cte_names

    def _replace_tables_with_views(self, query: sqlglot.exp.Expression, project_id: str) -> sqlglot.exp.Expression:
        """Replace table references with their corresponding view functions"""
        query = query.copy()

        # Find all table references in the query
        for table in query.find_all(sqlglot.exp.Table):
            table_name = table.name.lower()

            # Skip if it's a CTE reference
            if self._is_cte_reference(query, table):
                continue

            # Skip if it's not an allowed table
            if not self.table_registry.is_table_allowed(table_name):
                continue

            # Replace with view function
            self._replace_table_with_view_function(table, table_name, project_id, query)

        return query

    def _replace_table_with_view_function(self, table: sqlglot.exp.Table, table_name: str, project_id: str, query: sqlglot.exp.Expression):
        """Replace a single table with its view function"""
        view_name = f"{table_name}_{VIEW_VERSION}"

        if table_name == "traces":
            # Traces view requires project_id, start_time, and end_time
            # Find the query context that contains this table
            containing_query = self._find_containing_query_for_table(table, query)
            start_time, end_time = self._extract_time_filters_for_traces(containing_query)

            # Create function call with parameters
            args = [
                sqlglot.exp.EQ(this=sqlglot.exp.to_identifier("project_id"), expression=sqlglot.exp.Literal.string(project_id)),
                sqlglot.exp.EQ(this=sqlglot.exp.to_identifier("start_time"), expression=start_time),
                sqlglot.exp.EQ(this=sqlglot.exp.to_identifier("end_time"), expression=end_time)
            ]

            function_call = sqlglot.exp.Anonymous(this=view_name, expressions=args)
            table.replace(sqlglot.exp.Table(this=function_call, alias=table.alias or table_name))
        else:
            # Other views only require project_id
            args = [
                sqlglot.exp.EQ(this=sqlglot.exp.to_identifier("project_id"), expression=sqlglot.exp.Literal.string(project_id))
            ]

            function_call = sqlglot.exp.Anonymous(this=view_name, expressions=args)
            table.replace(sqlglot.exp.Table(this=function_call, alias=table.alias or table_name))

    def _find_containing_query_for_table(self, table: sqlglot.exp.Table, query: sqlglot.exp.Expression) -> sqlglot.exp.Expression:
        """Find the specific query context (main query or CTE) that contains the given table"""
        # First, check CTEs (they are more specific than main query)
        with_clause = query.args.get("with")
        if with_clause:
            for cte in with_clause.expressions:
                cte_tables = list(cte.this.find_all(sqlglot.exp.Table))
                for t in cte_tables:
                    if t is table:
                        return cte.this

        # If not in any CTE, check if the table is directly in the main query
        # Use a more specific search that doesn't include tables from CTEs
        main_from = query.args.get("from")
        if main_from:
            main_tables = list(main_from.find_all(sqlglot.exp.Table))
            for t in main_tables:
                if t is table:
                    return query

        # Fallback to main query if not found (shouldn't happen)
        return query

    def _extract_time_filters_for_traces(self, query: sqlglot.exp.Expression) -> tuple[sqlglot.exp.Expression, sqlglot.exp.Expression]:
        """Extract start_time and end_time filters for traces view"""
        start_time = sqlglot.exp.Literal.string("1970-01-01 00:00:00")  # Unix epoch start
        end_time = sqlglot.exp.Literal.string("2099-12-31 23:59:59")    # Far future default

        # Look for time filters in WHERE clause
        where_clause = query.args.get("where")
        if not where_clause:
            return start_time, end_time

        for condition in where_clause.find_all(sqlglot.exp.GT, sqlglot.exp.GTE, sqlglot.exp.EQ, sqlglot.exp.LT, sqlglot.exp.LTE, sqlglot.exp.Between):
            if isinstance(condition.this, sqlglot.exp.Column):
                if isinstance(condition, sqlglot.exp.Between):
                    column_name = condition.this.this.name.lower()

                    # Check if this condition is on traces table or unqualified
                    table_name = condition.this.table.lower() if condition.this.table else None
                    if table_name and table_name != "traces":
                        continue

                    if column_name == "start_time":
                        # For start_time BETWEEN low AND high, use low as start_time and high as end_time
                        start_time = condition.args.get("low")
                        end_time = condition.args.get("high")
                    elif column_name == "end_time":
                        # For end_time BETWEEN low AND high, use high as end_time (ignore low boundary)
                        end_time = condition.args.get("high")
                else:
                    column_name = condition.left.this.name.lower()

                    table_name = condition.left.table.lower() if condition.left.table else None
                    if table_name and table_name != "traces":
                        continue

                    if column_name == "start_time":
                        if isinstance(condition, (sqlglot.exp.GT, sqlglot.exp.GTE)):
                            start_time = condition.expression

                        # if start_time < value or start_time <= value, we can set the end_time to the value,
                        # because the inner query view actually filters by start_time BETWEEN start_time and end_time
                        elif isinstance(condition, (sqlglot.exp.LT, sqlglot.exp.LTE)):
                            end_time = condition.expression
                    elif column_name == "end_time":
                        if isinstance(condition, (sqlglot.exp.LT, sqlglot.exp.LTE)):
                            end_time = condition.expression

        return start_time, end_time

    def _strip_settings_clause(self, query: sqlglot.exp.Expression) -> sqlglot.exp.Expression:
         """Strip SETTINGS clause from query"""
         query = query.copy()
         query.args.pop('settings', None)
         return query


# Default instance for easy importing
default_validator = QueryValidator()


def validate_and_secure_query(sql_query: str, project_id: str) -> str:
    """Convenience function using default validator"""
    return default_validator.validate_and_secure_query(sql_query, project_id)
