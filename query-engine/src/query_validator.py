"""
Query Validation Module

This module provides secure query validation and rewriting for ClickHouse environment.
It ensures that user queries are safe, properly filtered by project_id, and only access allowed tables and columns.
"""

from typing import Dict, Set, List, Optional
from dataclasses import dataclass
import sqlglot
from sqlglot import exp
from src.utils import flatten_conditions

@dataclass
class TableSchema:
    """Defines the schema for an allowed table"""
    name: str
    allowed_columns: Set[str]
    time_column: Optional[str] = None  # For time-based filtering
    
    def is_column_allowed(self, column: str) -> bool:
        """Check if a column is allowed for this table"""
        return column.lower() in {col.lower() for col in self.allowed_columns}


class TableRegistry:
    """Registry of allowed tables and their schemas"""
    
    def __init__(self):
        self.tables: Dict[str, TableSchema] = {}
        self._setup_default_tables()
    
    def _setup_default_tables(self):
        """Setup default tables (spans and traces)"""
        # Spans table - OTEL spans
        spans_columns = {
            'span_id','status', 'name', 'path', 'parent_span_id', 'span_type',
            'start_time', 'end_time', 'input', 'output', 'request_model',
            'response_model', 'model', 'provider', 'input_tokens', 'output_tokens',
            'total_tokens', 'input_cost', 'output_cost', 'total_cost', 'attributes',
            'trace_id'
        }
        
        # Traces table - aggregated trace data
        traces_columns = {
            'trace_id', 'trace_type', 'metadata', 'start_time', 'end_time',
            'duration', 'input_tokens', 'output_tokens', 'total_tokens',
            'input_cost', 'output_cost', 'total_cost', 'status', 'user_id',
            'session_id', 'top_span_id'
        }

        evaluation_scores_columns = {
            "group_id", 
            "timestamp",
            "evaluation_id",
            "result_id",
            "name",
            "value",
            "trace_id",
            "evaluation_datapoint_id",
            "project_id"
        }

        evaluation_datapoints_columns = {
            "id",
            "evaluation_id",
            "trace_id",
            "created_at",
            "data",
            "target",
            "metadata",
            "index",
        }

        events_columns = {
            "id",
            "span_id",
            "name",
            "timestamp",
            "attributes",
            "user_id",
            "session_id",
        }
        
        self.tables['spans'] = TableSchema('spans', spans_columns, 'start_time')
        self.tables['traces'] = TableSchema('traces', traces_columns, 'start_time')
        self.tables['evaluation_scores'] = TableSchema('evaluation_scores', evaluation_scores_columns, 'timestamp')
        self.tables['evaluation_datapoints'] = TableSchema('evaluation_datapoints', evaluation_datapoints_columns, 'timestamp')
        self.tables['events'] = TableSchema('events', events_columns, 'timestamp')
    
    def register_table(self, schema: TableSchema):
        """Register a new table schema"""
        self.tables[schema.name.lower()] = schema
    
    def is_table_allowed(self, table_name: str) -> bool:
        """Check if a table is allowed"""
        return table_name.lower() in self.tables
    
    def get_table_schema(self, table_name: str) -> Optional[TableSchema]:
        """Get schema for a table"""
        return self.tables.get(table_name.lower())
    
    def get_allowed_tables(self) -> Set[str]:
        """Get set of all allowed table names"""
        return set(self.tables.keys())


class QueryValidationError(Exception):
    """Exception raised when query validation fails"""
    pass


class QueryValidator:
    """Main query validator and rewriter"""
    
    def __init__(self, table_registry: Optional[TableRegistry] = None):
        self.table_registry = table_registry or TableRegistry()
    
    def validate_and_secure_query(self, sql_query: str, project_id: str) -> str:
        """
        Main entry point: validates and secures a SQL query
        
        Args:
            sql_query: The user's SQL query
            project_id: The project ID to filter by
            
        Returns:
            Secured and rewritten SQL query
            
        Raises:
            QueryValidationError: If query is invalid or unsafe
        """
        try:
            parsed = sqlglot.parse_one(sql_query, read="clickhouse")

            # Security validation
            self._validate_security(parsed)

            # Table and column validation
            self._validate_tables_and_columns(parsed)

            # Process and secure CTEs
            parsed = self._process_ctes(parsed, project_id)
    
            # Add project_id filters to main query
            parsed = self._add_project_id_filters(parsed, project_id)

            # Add traces CTE (special case)
            parsed = self._add_traces_cte(parsed, project_id)

            # Convert back to SQL
            return parsed.sql(dialect="clickhouse", pretty=True)

        except QueryValidationError:
            raise
        except Exception as e:
            raise QueryValidationError(f"Query validation failed: {str(e)}")

    def _validate_security(self, query: exp.Expression):
        """Validate that query is secure (only SELECT, no writes)"""
        if not isinstance(query, exp.Select):
            raise QueryValidationError("Only SELECT statements are allowed")

        # Check for any write operations
        for node in query.find_all(exp.Update, exp.Insert, exp.Delete):
            raise QueryValidationError(f"{type(node).__name__} statements are not allowed")

    def _validate_tables_and_columns(self, query: exp.Expression):
        """Validate that all tables and columns are allowed"""
        # Check all table references
        for table in query.find_all(exp.Table):
            table_name = table.name.lower()
            
            # Skip if it's a CTE reference
            if self._is_cte_reference(query, table):
                continue
                
            if not self.table_registry.is_table_allowed(table_name):
                raise QueryValidationError(f"Table '{table_name}' is not allowed")
        
        # Check all column references
        for column in query.find_all(exp.Column):
            self._validate_column_access(query, column)
    
    def _validate_column_access(self, query: exp.Expression, column: exp.Column):
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
    
    def _is_cte_reference(self, query: exp.Expression, table: exp.Table) -> bool:
        """Check if a table reference is actually a CTE"""
        if not query.args.get("with"):
            return False
            
        cte_names = {cte.alias.lower() for cte in query.args["with"].expressions}
        return table.name.lower() in cte_names
    
    def _queries_allowed_table(self, query: exp.Expression, table_name: str) -> bool:
        """Check if a query references a specific allowed table"""
        for table in query.find_all(exp.Table):
            if table.name.lower() == table_name.lower():
                # Make sure it's not a CTE reference
                if not self._is_cte_reference(query, table):
                    return True
        return False
    
    def _add_project_id_filters(self, query: exp.Expression, project_id: str) -> exp.Expression:
        """Add project_id filters to queries that need them, including subqueries"""
        query = query.copy()
        
        # First, recursively process all subqueries
        query = self._process_subqueries_for_project_id(query, project_id)

        # Then check if main query needs project_id filter
        needs_filter = False
        for table_name in self.table_registry.get_allowed_tables():
            if self._queries_allowed_table(query, table_name):
                needs_filter = True
                break

        if needs_filter:
            # We don't check for WITH FILL on the outermost query so that we
            # don't return project_id unless it was explicitly requested.
            query = self._add_project_id_filter(query, project_id)
            
        return query
    
    def _process_subqueries_for_project_id(self, query: exp.Expression, project_id: str) -> exp.Expression:
        """Recursively process all subqueries to add project_id filters"""
        query = query.copy()
        
        # Find all SELECT expressions in the query tree (excluding the root)
        all_selects = list(query.find_all(exp.Select))
        
        # Remove the root query from the list (the first one is typically the root)
        subqueries = [select for select in all_selects if select != query]
        
        # Filter out subqueries that are inside CTEs (already processed)
        subqueries_to_process = []
        for subquery in subqueries:
            # Check if this subquery is inside a CTE
            is_in_cte = False
            if query.args.get("with"):
                for cte in query.args["with"].expressions:
                    if subquery in list(cte.find_all(exp.Select)):
                        is_in_cte = True
                        break
            
            if not is_in_cte:
                subqueries_to_process.append(subquery)
        
        # Process each subquery that needs project_id filtering
        for subquery in subqueries_to_process:
            needs_filter = False
            for table_name in self.table_registry.get_allowed_tables():
                if self._queries_allowed_table(subquery, table_name):
                    needs_filter = True
                    break

            if needs_filter:
                # Check if subquery has WITH FILL - if so, need special handling
                if self._has_with_fill_clause(subquery):
                    # For WITH FILL subqueries, we need to replace the subquery in-place
                    # with its wrapped version
                    wrapped_query = self._wrap_with_fill_query(subquery, project_id)
                    
                    # Replace the subquery with the wrapped version
                    # This is tricky because we need to update the parent's reference
                    subquery.replace(wrapped_query)
                else:
                    # Standard processing for non-WITH FILL subqueries
                    # Apply project_id filter to the subquery in-place
                    self._add_project_id_filter_inplace(subquery, project_id)
                    # Handle GROUP BY for aggregation queries (but don't add to SELECT)
                    self._ensure_project_id_in_group_by(subquery)
        
        return query
    
    def _add_project_id_filter(self, query: exp.Expression, project_id: str) -> exp.Expression:
        """Add or replace project_id filter in WHERE clause"""
        query = query.copy()
        
        project_id_filter_exists = False
        
        # Check existing WHERE clause for project_id filter
        if query.args.get("where"):
            for condition in query.args["where"].find_all(exp.EQ):
                if (isinstance(condition.left, exp.Column) and 
                    condition.left.this.name.lower() == "project_id"):
                    project_id_filter_exists = True
                    # Enforce the correct project_id
                    condition.set("expression", exp.Literal.string(project_id))
                    break
        
        # Add project_id filter if it doesn't exist
        if not project_id_filter_exists:
            project_id_condition = exp.condition(f"project_id = '{project_id}'")
            query = query.where(project_id_condition)
        
        return query
    
    def _add_project_id_filter_inplace(self, query: exp.Expression, project_id: str) -> None:
        """Add or replace project_id filter in WHERE clause (modifies query in-place)"""
        project_id_filter_exists = False
        
        # Check existing WHERE clause for project_id filter
        if query.args.get("where"):
            for condition in query.args["where"].find_all(exp.EQ):
                if (isinstance(condition.left, exp.Column) and 
                    condition.left.this.name.lower() == "project_id"):
                    project_id_filter_exists = True
                    # Enforce the correct project_id
                    condition.set("expression", exp.Literal.string(project_id))
                    break
        
        # Add project_id filter if it doesn't exist
        if not project_id_filter_exists:
            project_id_condition = exp.condition(f"project_id = '{project_id}'")
            query.set("where", query.where(project_id_condition).args.get("where"))
    
    def _process_ctes(self, query: exp.Expression, project_id: str) -> exp.Expression:
        """Process and secure CTEs that query allowed tables"""
        if not query.args.get("with"):
            return query

        query = query.copy()
        secured_cte_names = set()

        for cte in query.args["with"].expressions:
            # Check if CTE queries any allowed table
            needs_securing = False
            for table_name in self.table_registry.get_allowed_tables():
                if self._queries_allowed_table(cte.this, table_name):
                    needs_securing = True
                    break

            if needs_securing:
                secured_cte_names.add(cte.alias.lower())
                cte.set('this', self._secure_cte_query(cte.this, project_id))
        return query
    
    def _secure_cte_query(self, cte_query: exp.Expression, project_id: str) -> exp.Expression:
        """Secure a CTE query by adding project_id filter and ensuring proper selection"""
        if not any(self._queries_allowed_table(cte_query, table) 
                  for table in self.table_registry.get_allowed_tables()):
            return cte_query.copy()
        
        # Check if CTE has WITH FILL - if so, wrap it instead of adding project_id to SELECT
        if self._has_with_fill_clause(cte_query):
            return self._wrap_with_fill_query(cte_query, project_id)

        # Standard processing: Add project_id filter
        processed_query = self._add_project_id_filter(cte_query, project_id)
        
        # Ensure project_id is in SELECT if not already there
        has_project_id_in_select = False
        for expression in processed_query.expressions:
            if isinstance(expression, exp.Column) and expression.this.name.lower() == "project_id":
                has_project_id_in_select = True
                break
            if (isinstance(expression, exp.Alias) and 
                isinstance(expression.this, exp.Column) and 
                expression.this.this.name.lower() == "project_id"):
                has_project_id_in_select = True
                break
        
        if not has_project_id_in_select:
            processed_query = processed_query.select("project_id", append=True)
        
        # Handle GROUP BY for aggregation queries
        self._ensure_project_id_in_group_by(processed_query)
        
        return processed_query
    
    def _ensure_project_id_in_group_by(self, query: exp.Expression):
        """Ensure project_id is in GROUP BY when using aggregation"""
        group_clause = query.args.get("group")
        if not group_clause:
            return

        project_in_group_by = False
        for g_expr in group_clause.expressions:
            if (isinstance(g_expr, exp.Column) and 
                g_expr.this.name.lower() == "project_id"):
                project_in_group_by = True
                break

        if not project_in_group_by:
            # Append to existing GROUP BY
            new_expressions = list(group_clause.expressions) + [exp.column("project_id")]
            group_clause.set("expressions", new_expressions)
    
    def _has_with_fill_clause(self, query: exp.Expression) -> bool:
        """Check if query has ORDER BY ... WITH FILL using sqlglot AST"""
        order_clause = query.args.get("order")
        if not order_clause:
            return False

        # Check each ordering expression for WITH FILL
        for ordered_expr in order_clause.expressions:
            # sqlglot stores attributes in the args dict, not as direct attributes
            if ordered_expr.args.get('with_fill'):
                return True

        return False

    def _wrap_with_fill_query(self, query: exp.Expression, project_id: str) -> exp.Expression:
        """Wrap a WITH FILL query to add literal project_id in outer query"""
        query = query.copy()

        # Remove project_id from SELECT if present
        filtered_expressions = []
        for expr in query.expressions:
            # Skip direct project_id columns
            if isinstance(expr, exp.Column) and expr.this.name.lower() == "project_id":
                continue
            # Skip aliased project_id columns  
            if (isinstance(expr, exp.Alias) and 
                isinstance(expr.this, exp.Column) and 
                expr.this.this.name.lower() == "project_id"):
                continue
            filtered_expressions.append(expr)

        query.set("expressions", filtered_expressions)

        # Apply project_id filter (but don't select it)
        query = self._add_project_id_filter(query, project_id)

        # Remove project_id from GROUP BY if present (since we're not selecting it)
        group_clause = query.args.get("group")
        if group_clause:
            filtered_group_expressions = []
            for g_expr in group_clause.expressions:
                if not (isinstance(g_expr, exp.Column) and 
                       g_expr.this.name.lower() == "project_id"):
                    filtered_group_expressions.append(g_expr)

            if filtered_group_expressions:
                group_clause.set("expressions", filtered_group_expressions)
            else:
                # Remove GROUP BY entirely if only project_id was in it
                query.args.pop("group", None)

        # Wrap in outer query that adds literal project_id
        wrapped = exp.select("*", exp.Literal.string(project_id).as_("project_id")).from_(
            query.subquery()
        )

        return wrapped
    
    def _add_traces_cte(self, query: exp.Expression, project_id: str) -> exp.Expression:
        """Add traces CTE - special case for trace aggregation"""
        query = query.copy()
        
        # Build WHERE conditions for traces CTE
        where_conditions = [f"project_id = '{project_id}'"]
        
        # Only extract and push down time filters if the main query is actually querying traces table
        if self._queries_allowed_table(query, "traces"):
            pushdown_filters = self._extract_pushdown_filters_from_traces_query(query)
            if pushdown_filters:
                for time_filter in pushdown_filters:
                    column = time_filter.find(exp.Column)
                    if column:
                        column.set('table', None)  # Remove table qualifier
                    time_filter_sql = time_filter.sql(dialect="clickhouse")
                    where_conditions.append(time_filter_sql)

        where_clause = " AND ".join(where_conditions)
        
        # Collect existing CTEs, excluding any named 'traces'
        final_ctes = []
        if query.args.get("with"):
            for existing_cte in query.args["with"].expressions:
                if existing_cte.alias.lower() != "traces":
                    final_ctes.append(existing_cte)
        
        # Build traces CTE SQL
        traces_cte_sql = f"""
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
            argMax(trace_metadata, length(trace_metadata)) AS metadata,
            anyIf(session_id, session_id != '<null>' AND session_id != '') AS session_id,
            anyIf(user_id, user_id != '<null>' AND user_id != '') AS user_id,
            anyIf(status, status != '<null>' AND status != '') AS status,
            anyIf(span_id, parent_span_id='00000000-0000-0000-0000-000000000000') AS top_span_id,
            -- This is a temporary hack; some historical spans don't have trace_type set
            CASE WHEN countIf(span_type IN (3, 4, 5)) > 0 THEN 2 ELSE 0 END AS trace_type,
            trace_id,
            project_id
        FROM spans
        WHERE {where_clause}
        GROUP BY trace_id, project_id
        """
        
        # Parse and create CTE
        cte_query = sqlglot.parse_one(traces_cte_sql, read="clickhouse")
        
        column_list = [
            "start_time", "end_time", "input_tokens", "output_tokens", "total_tokens",
            "input_cost", "output_cost", "total_cost", "duration", "metadata",
            "session_id", "user_id", "status", "top_span_id", "trace_type", "trace_id", "project_id"
        ]
        
        traces_cte = exp.CTE(
            this=cte_query,
            alias=exp.TableAlias(
                this=exp.to_identifier("traces"),
                columns=[exp.to_identifier(col) for col in column_list]
            )
        )
        
        final_ctes.append(traces_cte)
        query.set("with", exp.With(expressions=final_ctes))
        
        return query
    
    def _extract_pushdown_filters_from_traces_query(self, query: exp.Expression) -> List[exp.Expression]:
        """Extract time-based filters that can be pushed down to traces CTE"""
        where_clause = query.args.get("where")
        if not where_clause:
            return []
        
        # Recursively flatten all AND conditions to get individual conditions
        
        original_conditions = flatten_conditions(where_clause.this)
        pushdown_filters = []
        remaining_conditions = []
        
        for condition in original_conditions:
            is_pushdown_filter = False
            # Check for time filters that can be pushed down
            if (isinstance(condition, (exp.GT, exp.GTE, exp.EQ, exp.NEQ, exp.LT, exp.LTE)) and 
                isinstance(condition.left, exp.Column)):
                
                if condition.left.this.name.lower() in ["start_time", "end_time"]:
                    if not condition.left.table or condition.left.table.lower() == 'traces':
                        is_pushdown_filter = True
            
            if is_pushdown_filter:
                pushdown_filters.append(condition.copy())
            else:
                remaining_conditions.append(condition)
        
        # Rebuild WHERE clause without extracted filters
        if not remaining_conditions:
            query.args.pop("where", None)
        else:
            new_where_this = remaining_conditions[0]
            if len(remaining_conditions) > 1:
                new_where_this = exp.and_(*remaining_conditions)
            where_clause.set('this', new_where_this)
        
        return pushdown_filters


# Default instance for easy importing
default_validator = QueryValidator()


def validate_and_secure_query(sql_query: str, project_id: str) -> str:
    """Convenience function using default validator"""
    return default_validator.validate_and_secure_query(sql_query, project_id)