from typing import Any
import logging

logger = logging.getLogger(__name__)


class QueryBuilderError(Exception):
    pass


class JsonToSqlConverter:
    COMPARISON_OPS = {
        'eq': '=',
        'ne': '!=',
        'gt': '>',
        'gte': '>=',
        'lt': '<',
        'lte': '<='
    }

    def _is_placeholder(self, value: str) -> bool:
        return isinstance(value, str) and value.startswith('{') and value.endswith('}') and ':' in value

    def _format_value(self, value) -> str:
        if value is None:
            return 'NULL'

        if self._is_placeholder(str(value)):
            return str(value)

        if isinstance(value, (int, float)) and not isinstance(value, bool):
            return str(value)

        if isinstance(value, bool):
            return str(value).upper()

        return f"'{value}'"

    def _get_interval_expr(self, time_range: dict[str, Any]) -> str:
        if 'interval_value' in time_range and 'interval_unit' in time_range:
            return f"toInterval({time_range['interval_value']}, {time_range['interval_unit']})"
        raise QueryBuilderError("timeRange must specify 'interval_value' and 'interval_unit'")

    def convert(self, query_dict: dict[str, Any]) -> str:
        try:
            # Validate that query has something to select
            has_time_range = bool(query_dict.get('time_range'))
            has_dimensions = bool(query_dict.get('dimensions'))
            has_metrics = bool(query_dict.get('metrics'))

            if not (has_time_range or has_dimensions or has_metrics):
                raise QueryBuilderError(
                    "Query must have at least one of: metrics, dimensions, or time_range"
                )

            parts = [
                'SELECT',
                self._build_select_clause(query_dict),
                f'FROM {query_dict["table"]}'
            ]

            where_clause = self._build_where_clause(query_dict)
            if where_clause:
                parts.append(where_clause)

            group_clause = self._build_group_by_clause(query_dict)
            if group_clause:
                parts.append(group_clause)

            order_clause = self._build_order_by_clause(query_dict)
            if order_clause:
                parts.append(order_clause)

            limit = query_dict.get('limit')
            if limit:
                parts.append(f'LIMIT {limit}')

            return '\n'.join(parts)
        except Exception as e:
            raise QueryBuilderError(f"Failed to convert to SQL: {e}")

    def _build_select_clause(self, query_dict: dict[str, Any]) -> str:
        select_items = []

        time_range = query_dict.get('time_range')
        if time_range:
            select_items.append(self._time_bucket_sql(time_range))

        dimensions = query_dict.get('dimensions', [])
        if dimensions:
            dims_to_add = [d for d in dimensions if d != 'time' or not time_range]
            select_items.extend(dims_to_add)

        metrics = query_dict.get('metrics', [])
        select_items.extend(self._metric_sql(m) for m in metrics)

        return '    ' + ',\n    '.join(select_items)

    def _build_where_clause(self, query_dict: dict[str, Any]) -> str | None:
        conditions = []

        filters = query_dict.get('filters', [])
        if filters:
            conditions.extend(self._filter_sql(f) for f in filters)

        time_range = query_dict.get('time_range')
        if time_range:
            conditions.extend(self._get_time_range_conditions(query_dict))

        return 'WHERE\n    ' + '\n    AND '.join(conditions) if conditions else None

    def _get_time_range_conditions(self, query_dict: dict[str, Any]) -> list[str]:
        conditions = []
        time_range = query_dict['time_range']
        col = time_range['column']
        time_from = time_range['from']
        time_to = time_range['to']
        filters = query_dict.get('filters', [])

        def matches_filter_value(f, expected_value):
            if 'string_value' in f:
                return f['string_value'] == expected_value
            elif 'number_value' in f:
                return f['number_value'] == expected_value
            return False

        has_gte = any(f.get('field') == col and f.get('op', '').lower() == 'gte' and matches_filter_value(f, time_from) for f in filters)
        has_lte = any(f.get('field') == col and f.get('op', '').lower() == 'lte' and matches_filter_value(f, time_to) for f in filters)

        if not has_gte:
            conditions.append(f"{col} >= {time_from}")
        if not has_lte:
            conditions.append(f"{col} <= {time_to}")

        return conditions

    def _build_group_by_clause(self, query_dict: dict[str, Any]) -> str | None:
        group_cols = []

        if query_dict.get('time_range'):
            group_cols.append('time')

        dimensions = query_dict.get('dimensions', [])
        if dimensions:
            dims_to_group = [d for d in dimensions if d != 'time' or not query_dict.get('time_range')]
            group_cols.extend(dims_to_group)

        return 'GROUP BY ' + ', '.join(group_cols) if group_cols else None

    def _build_order_by_clause(self, query_dict: dict[str, Any]) -> str | None:
        order_by = query_dict.get('order_by', [])
        time_range = query_dict.get('time_range')

        if order_by:
            orders = [f"{o['field']} {o.get('dir', 'asc').upper()}" for o in order_by]
            order_clause = 'ORDER BY ' + ', '.join(orders)
        elif time_range:
            order_clause = 'ORDER BY time'
        else:
            return None

        if time_range and time_range.get('fill_gaps'):
            from_val = time_range['from']
            to_val = time_range['to']
            interval_expr = self._get_interval_expr(time_range)

            order_clause += f""" WITH FILL
    FROM toStartOfInterval({from_val}, {interval_expr})
    TO toStartOfInterval({to_val}, {interval_expr})
    STEP {interval_expr}"""

        return order_clause

    def _time_bucket_sql(self, time_range: dict[str, Any]) -> str:
        col = time_range['column']
        interval_expr = self._get_interval_expr(time_range)
        return f"toStartOfInterval({col}, {interval_expr}) AS time"

    def _metric_sql(self, metric: dict[str, Any]) -> str:
        fn = metric['fn']
        col = metric['column']
        alias = metric.get('alias', col)

        if fn.lower() == 'quantile' and metric.get('args'):
            return f"quantile({metric['args'][0]})({col}) AS {alias}"

        return f"{fn}({col}) AS {alias}"

    def _filter_sql(self, filter_spec: dict[str, Any]) -> str:
        field = filter_spec['field']
        op = filter_spec['op']

        if 'string_value' in filter_spec:
            value = filter_spec['string_value']
        elif 'number_value' in filter_spec:
            value = filter_spec['number_value']
        else:
            available_keys = list(filter_spec.keys())
            raise QueryBuilderError(
                f"Filter must have either string_value or number_value. "
                f"Available keys: {available_keys}"
            )

        op_lower = op.lower()

        if op_lower in self.COMPARISON_OPS:
            return f"{field} {self.COMPARISON_OPS[op_lower]} {self._format_value(value)}"

        if op_lower == 'includes':
            return f"has({field}, {self._format_value(value)})"

        raise QueryBuilderError(f"Unsupported operator: {op}")


def convert_json_to_sql(query_dict: dict[str, Any]) -> str:
    converter = JsonToSqlConverter()
    return converter.convert(query_dict)
