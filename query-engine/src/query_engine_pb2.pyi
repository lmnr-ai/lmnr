from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class Metric(_message.Message):
    __slots__ = ("fn", "column", "args", "alias")
    FN_FIELD_NUMBER: _ClassVar[int]
    COLUMN_FIELD_NUMBER: _ClassVar[int]
    ARGS_FIELD_NUMBER: _ClassVar[int]
    ALIAS_FIELD_NUMBER: _ClassVar[int]
    fn: str
    column: str
    args: _containers.RepeatedScalarFieldContainer[float]
    alias: str
    def __init__(self, fn: _Optional[str] = ..., column: _Optional[str] = ..., args: _Optional[_Iterable[float]] = ..., alias: _Optional[str] = ...) -> None: ...

class Filter(_message.Message):
    __slots__ = ("field", "op", "string_value", "number_value")
    FIELD_FIELD_NUMBER: _ClassVar[int]
    OP_FIELD_NUMBER: _ClassVar[int]
    STRING_VALUE_FIELD_NUMBER: _ClassVar[int]
    NUMBER_VALUE_FIELD_NUMBER: _ClassVar[int]
    field: str
    op: str
    string_value: str
    number_value: float
    def __init__(self, field: _Optional[str] = ..., op: _Optional[str] = ..., string_value: _Optional[str] = ..., number_value: _Optional[float] = ...) -> None: ...

class TimeRange(_message.Message):
    __slots__ = ("column", "to", "interval_unit", "interval_value", "fill_gaps")
    COLUMN_FIELD_NUMBER: _ClassVar[int]
    FROM_FIELD_NUMBER: _ClassVar[int]
    TO_FIELD_NUMBER: _ClassVar[int]
    INTERVAL_UNIT_FIELD_NUMBER: _ClassVar[int]
    INTERVAL_VALUE_FIELD_NUMBER: _ClassVar[int]
    FILL_GAPS_FIELD_NUMBER: _ClassVar[int]
    column: str
    to: str
    interval_unit: str
    interval_value: str
    fill_gaps: bool
    def __init__(self, column: _Optional[str] = ..., to: _Optional[str] = ..., interval_unit: _Optional[str] = ..., interval_value: _Optional[str] = ..., fill_gaps: bool = ..., **kwargs) -> None: ...

class OrderBy(_message.Message):
    __slots__ = ("field", "dir")
    FIELD_FIELD_NUMBER: _ClassVar[int]
    DIR_FIELD_NUMBER: _ClassVar[int]
    field: str
    dir: str
    def __init__(self, field: _Optional[str] = ..., dir: _Optional[str] = ...) -> None: ...

class QueryStructure(_message.Message):
    __slots__ = ("table", "metrics", "dimensions", "filters", "time_range", "order_by", "limit")
    TABLE_FIELD_NUMBER: _ClassVar[int]
    METRICS_FIELD_NUMBER: _ClassVar[int]
    DIMENSIONS_FIELD_NUMBER: _ClassVar[int]
    FILTERS_FIELD_NUMBER: _ClassVar[int]
    TIME_RANGE_FIELD_NUMBER: _ClassVar[int]
    ORDER_BY_FIELD_NUMBER: _ClassVar[int]
    LIMIT_FIELD_NUMBER: _ClassVar[int]
    table: str
    metrics: _containers.RepeatedCompositeFieldContainer[Metric]
    dimensions: _containers.RepeatedScalarFieldContainer[str]
    filters: _containers.RepeatedCompositeFieldContainer[Filter]
    time_range: TimeRange
    order_by: _containers.RepeatedCompositeFieldContainer[OrderBy]
    limit: int
    def __init__(self, table: _Optional[str] = ..., metrics: _Optional[_Iterable[_Union[Metric, _Mapping]]] = ..., dimensions: _Optional[_Iterable[str]] = ..., filters: _Optional[_Iterable[_Union[Filter, _Mapping]]] = ..., time_range: _Optional[_Union[TimeRange, _Mapping]] = ..., order_by: _Optional[_Iterable[_Union[OrderBy, _Mapping]]] = ..., limit: _Optional[int] = ...) -> None: ...

class QueryRequest(_message.Message):
    __slots__ = ("query", "project_id")
    QUERY_FIELD_NUMBER: _ClassVar[int]
    PROJECT_ID_FIELD_NUMBER: _ClassVar[int]
    query: str
    project_id: str
    def __init__(self, query: _Optional[str] = ..., project_id: _Optional[str] = ...) -> None: ...

class QueryResponse(_message.Message):
    __slots__ = ("success", "error")
    SUCCESS_FIELD_NUMBER: _ClassVar[int]
    ERROR_FIELD_NUMBER: _ClassVar[int]
    success: SuccessResponse
    error: ErrorResponse
    def __init__(self, success: _Optional[_Union[SuccessResponse, _Mapping]] = ..., error: _Optional[_Union[ErrorResponse, _Mapping]] = ...) -> None: ...

class SuccessResponse(_message.Message):
    __slots__ = ("query",)
    QUERY_FIELD_NUMBER: _ClassVar[int]
    query: str
    def __init__(self, query: _Optional[str] = ...) -> None: ...

class ErrorResponse(_message.Message):
    __slots__ = ("error",)
    ERROR_FIELD_NUMBER: _ClassVar[int]
    error: str
    def __init__(self, error: _Optional[str] = ...) -> None: ...

class JsonToSqlRequest(_message.Message):
    __slots__ = ("query_structure",)
    QUERY_STRUCTURE_FIELD_NUMBER: _ClassVar[int]
    query_structure: QueryStructure
    def __init__(self, query_structure: _Optional[_Union[QueryStructure, _Mapping]] = ...) -> None: ...

class JsonToSqlSuccessResponse(_message.Message):
    __slots__ = ("sql",)
    SQL_FIELD_NUMBER: _ClassVar[int]
    sql: str
    def __init__(self, sql: _Optional[str] = ...) -> None: ...

class JsonToSqlResponse(_message.Message):
    __slots__ = ("success", "error")
    SUCCESS_FIELD_NUMBER: _ClassVar[int]
    ERROR_FIELD_NUMBER: _ClassVar[int]
    success: JsonToSqlSuccessResponse
    error: ErrorResponse
    def __init__(self, success: _Optional[_Union[JsonToSqlSuccessResponse, _Mapping]] = ..., error: _Optional[_Union[ErrorResponse, _Mapping]] = ...) -> None: ...

class SqlToJsonRequest(_message.Message):
    __slots__ = ("sql",)
    SQL_FIELD_NUMBER: _ClassVar[int]
    sql: str
    def __init__(self, sql: _Optional[str] = ...) -> None: ...

class SqlToJsonSuccessResponse(_message.Message):
    __slots__ = ("query_structure",)
    QUERY_STRUCTURE_FIELD_NUMBER: _ClassVar[int]
    query_structure: QueryStructure
    def __init__(self, query_structure: _Optional[_Union[QueryStructure, _Mapping]] = ...) -> None: ...

class SqlToJsonResponse(_message.Message):
    __slots__ = ("success", "error")
    SUCCESS_FIELD_NUMBER: _ClassVar[int]
    ERROR_FIELD_NUMBER: _ClassVar[int]
    success: SqlToJsonSuccessResponse
    error: ErrorResponse
    def __init__(self, success: _Optional[_Union[SqlToJsonSuccessResponse, _Mapping]] = ..., error: _Optional[_Union[ErrorResponse, _Mapping]] = ...) -> None: ...
