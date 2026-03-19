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
            "span_id",
            "status",
            "name",
            "path",
            "parent_span_id",
            "span_type",
            "start_time",
            "end_time",
            "duration",
            "input",
            "output",
            "request_model",
            "response_model",
            "model",
            "provider",
            "input_tokens",
            "output_tokens",
            "total_tokens",
            "input_cost",
            "output_cost",
            "total_cost",
            "attributes",
            "trace_id",
            "tags",
        }

        traces_columns = {
            "id",
            "trace_type",
            "metadata",
            "start_time",
            "end_time",
            "duration",
            "input_tokens",
            "output_tokens",
            "total_tokens",
            "input_cost",
            "output_cost",
            "total_cost",
            "status",
            "user_id",
            "session_id",
            "top_span_id",
            "top_span_name",
            "top_span_type",
            "tags",
            "span_names",
            "root_span_input",
            "root_span_output",
        }

        dataset_datapoints_columns = {
            "id",
            "created_at",
            "dataset_id",
            "data",
            "target",
            "metadata",
        }

        evaluation_datapoints_columns = {
            "id",
            "evaluation_id",
            "trace_id",
            "created_at",
            "data",
            "target",
            "metadata",
            "executor_output",
            "index",
            "group_id",
            "scores",
        }

        events_columns = {
            "id",
            "span_id",
            "name",
            "timestamp",
            "attributes",
            "trace_id",
            "user_id",
            "session_id",
        }

        tags_columns = {
            "id",
            "span_id",
            "name",
            "created_at",
            "source",
        }

        signal_runs_columns = {
            "project_id",
            "signal_id",
            "job_id",
            "trigger_id",
            "trace_id",
            "run_id",
            "status",
            "event_id",
            "updated_at",
        }

        signal_events_columns = {
            "id",
            "project_id",
            "signal_id",
            "trace_id",
            "run_id",
            "name",
            "payload",
            "timestamp",
            "summary",
            "clusters",
        }

        logs_columns = {
            "log_id",
            "project_id",
            "time",
            "observed_time",
            "severity_number",
            "severity_text",
            "body",
            "attributes",
            "trace_id",
            "span_id",
            "flags",
            "event_name",
        }

        self.tables["spans"] = TableSchema("spans", spans_columns, "start_time")
        self.tables["traces"] = TableSchema("traces", traces_columns, "start_time")
        self.tables["dataset_datapoints"] = TableSchema(
            "dataset_datapoints", dataset_datapoints_columns, "created_at"
        )
        # same as dataset_datapoints, but dataset_datapoints_v0 view only exposes
        # the latest version of each datapoint
        self.tables["dataset_datapoint_versions"] = TableSchema(
            "dataset_datapoint_versions", dataset_datapoints_columns, "created_at"
        )
        self.tables["evaluation_datapoints"] = TableSchema(
            "evaluation_datapoints", evaluation_datapoints_columns, "created_at"
        )

        evaluation_datapoints_columns = {
            "id",
            "evaluation_id",
            "data",
            "target",
            "metadata",
            "executor_output",
            "index",
            "trace_id",
            "group_id",
            "scores",
            "updated_at",
            "created_at",
            "dataset_id",
            "dataset_datapoint_id",
            "dataset_datapoint_created_at",
            "duration",
            "input_cost",
            "output_cost",
            "total_cost",
            "start_time",
            "end_time",
            "input_tokens",
            "output_tokens",
            "total_tokens",
            "trace_status",
            "trace_metadata",
            "trace_tags",
            "trace_spans",
        }
        self.tables["evaluation_datapoints"] = TableSchema(
            "evaluation_datapoints", evaluation_datapoints_columns, "created_at"
        )
        self.tables["events"] = TableSchema("events", events_columns, "timestamp")
        self.tables["tags"] = TableSchema("tags", tags_columns, "created_at")
        self.tables["signal_runs"] = TableSchema(
            "signal_runs", signal_runs_columns, "updated_at"
        )
        self.tables["signal_events"] = TableSchema(
            "signal_events", signal_events_columns, "timestamp"
        )
        self.tables["logs"] = TableSchema("logs", logs_columns, "time")

        clusters_columns = {
            "id",
            "signal_id",
            "name",
            "level",
            "centroid",
            "parent_id",
            "num_signal_events",
            "num_children_clusters",
            "created_at",
            "updated_at",
        }
        self.tables["clusters"] = TableSchema(
            "clusters", clusters_columns, "created_at"
        )

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

    # ClickHouse functions that can access the filesystem, network, or
    # other external resources.  Checked against all function calls in the
    # parsed AST to prevent injection via raw SQL expressions or any other
    # user-controlled SQL path.
    BLOCKED_FUNCTIONS: set[str] = {
        # Filesystem access
        "file",
        # Network / remote table access
        "url",
        "urlcluster",
        "remote",
        "remotesecure",
        # S3 / cloud storage
        "s3",
        "s3cluster",
        "s3queue",
        "gcs",
        "oss",
        "cosn",
        "hdfs",
        # External data lake access
        "deltalake",
        "iceberg",
        "hudi",
        "hive",
        # Table function that reads data
        "format",
        # Other table functions that can read external data
        "jdbc",
        "odbc",
        "mysql",
        "postgresql",
        "mongodb",
        "redis",
        "sqlite",
        "input",
        # Cluster execution
        "cluster",
        "clusterallreplicas",
        # Misc dangerous
        "executable",
        "azureblobstorage",
        # DoS via server-side delays
        "sleep",
        "sleepeachrow",
        # Dictionary access (bypasses table validation)
        "dictget",
        "dictgetordefault",
        "dictgetornull",
        "dicthas",
        # Server memory layout disclosure
        "addresstoline",
        "addresstolinewithinlines",
        "addresstosymbol",
        "demangle",
        # Server metadata / config disclosure
        "currentdatabase",
        "hostname",
        "version",
        "uptime",
        "getmacro",
    }

    @staticmethod
    def check_for_blocked_functions(node: sqlglot.exp.Expression) -> str | None:
        """Check an AST node tree for blocked functions.

        Returns the blocked function name if found, or None if clean.
        For Anonymous nodes, .name is the literal SQL function name.
        For recognized Func subclasses (Count, Sum, etc.), .name resolves
        to the first argument (column name), so we use sql_name() instead.
        """
        for func in node.find_all(sqlglot.exp.Anonymous, sqlglot.exp.Func):
            if isinstance(func, sqlglot.exp.Anonymous):
                func_name = func.name.lower()
            else:
                func_name = func.sql_name().lower()
            if func_name in QueryValidator.BLOCKED_FUNCTIONS:
                return func_name
        return None

    def _validate_security(self, query: sqlglot.exp.Expression):
        """Validate that query is secure (only SELECT, no writes)"""
        if not isinstance(query, sqlglot.exp.Select):
            raise QueryValidationError("Only SELECT statements are allowed")

        # Check for any write operations
        for node in query.find_all(
            sqlglot.exp.Update, sqlglot.exp.Insert, sqlglot.exp.Delete
        ):
            raise QueryValidationError(
                f"{type(node).__name__} statements are not allowed"
            )

        # Block dangerous functions that can access external resources.
        blocked = self.check_for_blocked_functions(query)
        if blocked:
            raise QueryValidationError(f"Function '{blocked}' is not allowed")

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

    def _validate_column_access(
        self, query: sqlglot.exp.Expression, column: sqlglot.exp.Column
    ):
        """Validate that a column access is allowed"""
        column_name = column.this.name if column.this else None
        if not column_name:
            return

        # project_id is never allowed in user queries
        if column_name.lower() == "project_id":
            raise QueryValidationError("Column 'project_id' does not exist")

        # If column has a table qualifier, validate it
        if column.table:
            table_name = column.table.lower()
            schema = self.table_registry.get_table_schema(table_name)
            if schema and not schema.is_column_allowed(column_name):
                raise QueryValidationError(f"Column '{column_name}' does not exist")
        else:
            # Unqualified column: resolve against FROM tables in the containing query
            self._validate_unqualified_column(query, column, column_name)

    def _validate_unqualified_column(
        self,
        query: sqlglot.exp.Expression,
        column: sqlglot.exp.Column,
        column_name: str,
    ):
        """Validate an unqualified column against the tables in the query's FROM clause.

        Skips validation for:
        - Columns inside aggregate/function expressions (may reference aliases)
        - Columns that match a SELECT alias in the containing query
        - Columns in queries that reference CTEs or subqueries (opaque schemas)
        """
        # Skip if the column is inside a function call (could be an alias reference)
        parent = column.parent
        while parent is not None:
            if isinstance(parent, (sqlglot.exp.Func, sqlglot.exp.Anonymous)):
                return
            if isinstance(parent, sqlglot.exp.Select):
                break
            parent = parent.parent

        # Find the innermost SELECT that contains this column
        containing_select = self._find_containing_select(column)
        if containing_select is None:
            return

        # Skip if the column name matches a SELECT alias (e.g. ORDER BY value,
        # WHERE on an aliased column, GROUP BY alias, etc.)
        if self._is_select_alias(containing_select, column_name):
            return

        # Collect tables referenced in the FROM clause of the containing SELECT
        from_tables = self._get_from_tables(containing_select)
        if not from_tables:
            return

        # If any FROM source is a CTE, subquery, or table not in our registry,
        # skip validation since we can't know what columns it exposes
        real_tables = []
        for table_name in from_tables:
            if self._is_cte_reference(query, sqlglot.exp.Table(this=sqlglot.exp.to_identifier(table_name))):
                return
            schema = self.table_registry.get_table_schema(table_name)
            if schema:
                real_tables.append(schema)
            else:
                # Unknown table source (could be a subquery alias); skip validation
                return

        if not real_tables:
            return

        # Check if the column exists in any of the referenced tables
        for schema in real_tables:
            if schema.is_column_allowed(column_name):
                return

        raise QueryValidationError(
            f"Column '{column_name}' does not exist in any referenced table"
        )

    @staticmethod
    def _is_select_alias(select: sqlglot.exp.Select, name: str) -> bool:
        """Check if ``name`` matches any alias defined in the SELECT clause."""
        for expr in select.args.get("expressions", []):
            if isinstance(expr, sqlglot.exp.Alias):
                if expr.alias and expr.alias.lower() == name.lower():
                    return True
        return False

    def _find_containing_select(
        self, node: sqlglot.exp.Expression
    ) -> sqlglot.exp.Select | None:
        """Walk up the AST to find the innermost SELECT containing this node."""
        current = node.parent
        while current is not None:
            if isinstance(current, sqlglot.exp.Select):
                return current
            current = current.parent
        return None

    def _get_from_tables(self, select: sqlglot.exp.Select) -> list[str]:
        """Extract table names from the FROM clause (including JOINs) of a SELECT."""
        tables = []
        from_clause = select.args.get("from")
        if from_clause:
            for table in from_clause.find_all(sqlglot.exp.Table):
                name = table.alias_or_name
                if name:
                    tables.append(name.lower())

        # Also check JOINs
        for join in select.args.get("joins", []):
            for table in join.find_all(sqlglot.exp.Table):
                name = table.alias_or_name
                if name:
                    tables.append(name.lower())

        return tables

    def _is_cte_reference(
        self, query: sqlglot.exp.Expression, table: sqlglot.exp.Table
    ) -> bool:
        """Check if a table reference is actually a CTE"""
        if not query.args.get("with"):
            return False

        cte_names = {cte.alias.lower() for cte in query.args["with"].expressions}
        return table.name.lower() in cte_names

    def _replace_tables_with_views(
        self, query: sqlglot.exp.Expression, project_id: str
    ) -> sqlglot.exp.Expression:
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

    def _replace_table_with_view_function(
        self,
        table: sqlglot.exp.Table,
        table_name: str,
        project_id: str,
        query: sqlglot.exp.Expression,
    ):
        """Replace a single table with its view function"""
        view_name = f"{table_name}_{VIEW_VERSION}"

        if table_name == "traces":
            # Traces view requires project_id, start_time, and end_time
            # Find the query context that contains this table
            containing_query = self._find_containing_query_for_table(table, query)
            start_time, end_time = self._extract_time_filters_for_traces(
                containing_query
            )

            # Create function call with parameters
            args = [
                sqlglot.exp.EQ(
                    this=sqlglot.exp.to_identifier("project_id"),
                    expression=sqlglot.exp.Literal.string(project_id),
                ),
                sqlglot.exp.EQ(
                    this=sqlglot.exp.to_identifier("start_time"), expression=start_time
                ),
                sqlglot.exp.EQ(
                    this=sqlglot.exp.to_identifier("end_time"), expression=end_time
                ),
            ]

            function_call = sqlglot.exp.Anonymous(this=view_name, expressions=args)
            table.replace(
                sqlglot.exp.Table(this=function_call, alias=table.alias or table_name)
            )
        else:
            # Other views only require project_id
            args = [
                sqlglot.exp.EQ(
                    this=sqlglot.exp.to_identifier("project_id"),
                    expression=sqlglot.exp.Literal.string(project_id),
                )
            ]

            function_call = sqlglot.exp.Anonymous(this=view_name, expressions=args)
            table.replace(
                sqlglot.exp.Table(this=function_call, alias=table.alias or table_name)
            )

    def _find_containing_query_for_table(
        self, table: sqlglot.exp.Table, query: sqlglot.exp.Expression
    ) -> sqlglot.exp.Expression:
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

    def _extract_time_filters_for_traces(
        self, query: sqlglot.exp.Expression
    ) -> tuple[sqlglot.exp.Expression, sqlglot.exp.Expression]:
        """Extract start_time and end_time filters for traces view"""
        start_time = sqlglot.exp.Literal.string(
            "1970-01-01 00:00:00"
        )  # Unix epoch start
        end_time = sqlglot.exp.Literal.string(
            "2099-12-31 23:59:59"
        )  # Far future default

        # Look for time filters in WHERE clause
        where_clause = query.args.get("where")
        if not where_clause:
            return start_time, end_time

        for condition in where_clause.find_all(
            sqlglot.exp.GT,
            sqlglot.exp.GTE,
            sqlglot.exp.EQ,
            sqlglot.exp.LT,
            sqlglot.exp.LTE,
            sqlglot.exp.Between,
        ):
            if isinstance(condition.this, sqlglot.exp.Column):
                if isinstance(condition, sqlglot.exp.Between):
                    column_name = condition.this.this.name.lower()

                    # Check if this condition is on traces table or unqualified
                    table_name = (
                        condition.this.table.lower() if condition.this.table else None
                    )
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

                    table_name = (
                        condition.left.table.lower() if condition.left.table else None
                    )
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

    def _strip_settings_clause(
        self, query: sqlglot.exp.Expression
    ) -> sqlglot.exp.Expression:
        """Strip SETTINGS clause from query"""
        query = query.copy()
        query.args.pop("settings", None)
        return query


# Default instance for easy importing
default_validator = QueryValidator()


def validate_and_secure_query(sql_query: str, project_id: str) -> str:
    """Convenience function using default validator"""
    return default_validator.validate_and_secure_query(sql_query, project_id)
