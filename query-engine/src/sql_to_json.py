import sqlglot
from typing import Any


class QueryBuilderError(Exception):
    pass


class SqlToJsonConverter:

    def convert(self, sql: str) -> dict[str, Any]:
        try:
            ast = sqlglot.parse_one(sql, read="clickhouse")

            if not isinstance(ast, sqlglot.exp.Select):
                raise QueryBuilderError("Only SELECT queries supported")

            table = ast.args['from'].this.name
            grouped_columns = self._get_grouped_columns(ast)

            metrics, dimensions, time_range = self._parse_select_expressions(ast, grouped_columns)
            filters = self._parse_where_clause(ast, time_range)
            order_by = self._parse_order_by_clause(ast)
            limit = self._parse_limit_clause(ast)

            result = {'table': table, 'metrics': metrics}

            if dimensions:
                result['dimensions'] = dimensions
            if filters:
                result['filters'] = filters
            if time_range:
                result['time_range'] = time_range
            if order_by:
                result['order_by'] = order_by
            if limit:
                result['limit'] = limit

            return result
        except Exception as e:
            raise QueryBuilderError(f"Failed to parse SQL: {e}")

    def _parse_select_expressions(self, ast: sqlglot.exp.Select, grouped_columns: set[str]) -> tuple[list[dict], list[str], dict | None]:
        metrics = []
        dimensions = []
        time_range = None

        for expr in ast.expressions:
            if isinstance(expr, sqlglot.exp.Alias):
                alias = expr.alias
                inner = expr.this

                if self._is_time_bucket(inner):
                    time_range = self._extract_time_range(ast, inner)
                elif alias in grouped_columns or self._is_simple_column_ref(inner, grouped_columns):
                    if isinstance(inner, sqlglot.exp.Column):
                        dimensions.append(inner.name)
                else:
                    metrics.append(self._extract_metric(inner, alias))
            elif isinstance(expr, sqlglot.exp.Column):
                dimensions.append(expr.name)

        return metrics, dimensions, time_range

    def _parse_where_clause(self, ast: sqlglot.exp.Select, time_range: dict | None) -> list[dict]:
        if not ast.args.get('where'):
            return []

        time_col = time_range['column'] if time_range else None
        return self._extract_filters(ast.args['where'].this, time_col)

    def _parse_order_by_clause(self, ast: sqlglot.exp.Select) -> list[dict[str, str]] | None:
        if not ast.args.get('order'):
            return None

        order_by = []
        for order in ast.args['order'].expressions:
            if isinstance(order, sqlglot.exp.Ordered):
                col = order.this.name if isinstance(order.this, sqlglot.exp.Column) else str(order.this)
                direction = "desc" if order.args.get("desc") else "asc"
                order_by.append({"field": col, "dir": direction})

        return order_by if order_by else None

    def _parse_limit_clause(self, ast: sqlglot.exp.Select) -> int | None:
        if not ast.args.get('limit'):
            return None

        limit_expr = ast.args['limit']
        try:
            if hasattr(limit_expr, 'this') and limit_expr.this:
                return int(str(limit_expr.this))
            elif hasattr(limit_expr, 'expression'):
                return int(str(limit_expr.expression))
            else:
                return int(str(limit_expr))
        except (ValueError, AttributeError, TypeError):
            return None

    def _get_grouped_columns(self, ast: sqlglot.exp.Select) -> set[str]:
        grouped = set()
        group_clause = ast.args.get('group')
        if group_clause:
            for expr in group_clause.expressions:
                if isinstance(expr, sqlglot.exp.Column):
                    grouped.add(expr.name)
                else:
                    grouped.add(str(expr))
        return grouped

    def _is_simple_column_ref(self, expr, grouped_columns: set[str]) -> bool:
        if isinstance(expr, sqlglot.exp.Column):
            return expr.name in grouped_columns
        return str(expr) in grouped_columns

    def _is_time_bucket(self, expr) -> bool:
        return (isinstance(expr, sqlglot.exp.Anonymous) and 
                str(expr.this).upper() == 'TOSTARTOFINTERVAL')

    def _extract_metric(self, expr, alias: str) -> dict[str, Any]:
        for node in expr.walk():
            if hasattr(sqlglot.exp, 'Quantile') and isinstance(node, sqlglot.exp.Quantile):
                return self._parse_quantile(node, alias)

            if isinstance(node, (sqlglot.exp.Count, sqlglot.exp.Sum, sqlglot.exp.Avg,
                                 sqlglot.exp.Min, sqlglot.exp.Max)):
                return self._parse_standard_agg(node, alias)

        return {'fn': 'unknown', 'column': str(expr), 'alias': alias}

    def _parse_quantile(self, node, alias: str) -> dict[str, Any]:
        column = self._extract_column(node.this) if node.this else 'unknown'
        percentile = 0.5

        if 'quantile' in node.args:
            quantile_arg = node.args['quantile']
            if isinstance(quantile_arg, sqlglot.exp.Literal):
                percentile = float(str(quantile_arg.this))

        return {
            'fn': 'quantile',
            'args': [percentile],
            'column': column,
            'alias': alias
        }

    def _parse_standard_agg(self, node, alias: str) -> dict[str, Any]:
        agg_map = {
            sqlglot.exp.Count: 'count',
            sqlglot.exp.Sum: 'sum',
            sqlglot.exp.Avg: 'avg',
            sqlglot.exp.Min: 'min',
            sqlglot.exp.Max: 'max'
        }

        for node_type, fn_name in agg_map.items():
            if isinstance(node, node_type):
                column = self._extract_column(node.this) if node.this else '*'
                return {'fn': fn_name, 'column': column, 'alias': alias}

        return {'fn': 'unknown', 'column': str(node), 'alias': alias}

    def _extract_column(self, expr) -> str:
        if isinstance(expr, sqlglot.exp.Column):
            return expr.name
        elif isinstance(expr, (sqlglot.exp.Sub, sqlglot.exp.Add, sqlglot.exp.Mul, sqlglot.exp.Div)):
            return expr.sql(dialect="clickhouse")
        elif isinstance(expr, sqlglot.exp.Star):
            return '*'
        return str(expr)

    def _extract_time_range(self, ast, expr) -> dict[str, Any]:
        time_col = expr.expressions[0].name
        interval_expr = expr.expressions[1]

        fill_gaps = self._has_with_fill(ast)
        from_val, to_val = self._extract_time_bounds_from_ast(ast, time_col)

        result = {
            'column': time_col,
            'from': from_val,
            'to': to_val,
            'fill_gaps': fill_gaps
        }

        if hasattr(interval_expr, 'expressions') and len(interval_expr.expressions) >= 2:
            interval_value = self._normalize_value(interval_expr.expressions[0])
            interval_unit = self._normalize_value(interval_expr.expressions[1])
            result['interval_value'] = interval_value
            result['interval_unit'] = interval_unit

        return result

    def _has_with_fill(self, ast) -> bool:
        order_clause = ast.args.get('order')
        if order_clause and hasattr(order_clause, 'expressions'):
            for order_expr in order_clause.expressions:
                # sqlglot stores with_fill in args dict, not as attribute
                if order_expr.args.get('with_fill'):
                    return True
        return False

    def _extract_time_bounds_from_ast(self, ast, time_col: str) -> tuple[str, str]:
        from_val = "{start_time:DateTime64}"
        to_val = "{end_time:DateTime64}"

        if ast.args.get('where'):
            from_val, to_val = self._extract_time_bounds(ast.args['where'].this, time_col)

        return from_val, to_val

    def _normalize_value(self, expr) -> str:
        if isinstance(expr, sqlglot.exp.Placeholder):
            name = str(expr.this.this if hasattr(expr.this, 'this') else expr.this)
            kind = expr.args.get('kind', 'String')
            kind_str = str(kind) if kind else 'String'
            kind_normalized = self._normalize_type(kind_str)
            return f"{{{name}:{kind_normalized}}}"
        elif isinstance(expr, sqlglot.exp.Literal):
            return str(expr.this)
        return str(expr)

    def _normalize_type(self, type_str: str) -> str:
        type_map = {
            'TEXT': 'String',
            'DATETIME64': 'DateTime64',
            'DATETIME': 'DateTime64',
        }
        return type_map.get(str(type_str).upper(), type_str)

    def _extract_filters(self, expr, time_col: str | None) -> list[dict[str, Any]]:
        filters = []

        comparison_map = {
            sqlglot.exp.EQ: 'eq',
            sqlglot.exp.NEQ: 'ne',
            sqlglot.exp.GT: 'gt',
            sqlglot.exp.GTE: 'gte',
            sqlglot.exp.LT: 'lt',
            sqlglot.exp.LTE: 'lte'
        }

        def walk(e):
            if isinstance(e, (sqlglot.exp.And, sqlglot.exp.Or)):
                walk(e.left)
                walk(e.right)
                return

            for expr_type, op in comparison_map.items():
                if isinstance(e, expr_type):
                    col = e.left.name if isinstance(e.left, sqlglot.exp.Column) else None
                    if col and col != time_col:
                        # Handle different right-hand side types
                        if isinstance(e.right, sqlglot.exp.Placeholder):
                            val = self._normalize_value(e.right)
                        elif isinstance(e.right, sqlglot.exp.Neg):
                            # Handle negative numbers explicitly
                            val = str(e.right.sql())
                        elif isinstance(e.right, sqlglot.exp.Literal):
                            val = str(e.right.this)
                        else:
                            val = str(e.right)

                        filter_dict = {'field': col, 'op': op}

                        # Try to parse as number, but be careful with strings that look like numbers
                        # Set only ONE of string_value or number_value (oneof field)
                        try:
                            # Check if it's a placeholder - if so, treat based on type hint
                            if isinstance(e.right, sqlglot.exp.Placeholder):
                                # Placeholders are strings by default unless they have a numeric type
                                filter_dict['string_value'] = val
                            else:
                                # Try to convert to number
                                num_val = float(val)
                                filter_dict['number_value'] = num_val
                        except (ValueError, TypeError):
                            filter_dict['string_value'] = val

                        filters.append(filter_dict)
                    return

        walk(expr)
        return filters

    def _extract_time_bounds(self, expr, time_col: str) -> tuple[str, str]:
        from_val = "{start_time:DateTime64}"
        to_val = "{end_time:DateTime64}"

        def walk(e):
            nonlocal from_val, to_val
            if isinstance(e, (sqlglot.exp.And, sqlglot.exp.Or)):
                walk(e.left)
                walk(e.right)
            elif isinstance(e, sqlglot.exp.GTE):
                col = e.left.name if isinstance(e.left, sqlglot.exp.Column) else None
                if col == time_col:
                    from_val = self._normalize_value(e.right)
            elif isinstance(e, sqlglot.exp.LTE):
                col = e.left.name if isinstance(e.left, sqlglot.exp.Column) else None
                if col == time_col:
                    to_val = self._normalize_value(e.right)

        walk(expr)
        return from_val, to_val


def convert_sql_to_json(sql: str) -> dict[str, Any]:
    converter = SqlToJsonConverter()
    return converter.convert(sql)

