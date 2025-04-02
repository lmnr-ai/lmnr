from google.protobuf.internal import containers as _containers
from google.protobuf.internal import enum_type_wrapper as _enum_type_wrapper
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from typing import ClassVar as _ClassVar, Iterable as _Iterable, Mapping as _Mapping, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class ModelProvider(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    ANTHROPIC: _ClassVar[ModelProvider]
    BEDROCK: _ClassVar[ModelProvider]
ANTHROPIC: ModelProvider
BEDROCK: ModelProvider

class Cookie(_message.Message):
    __slots__ = ("cookie_data",)
    class CookieDataEntry(_message.Message):
        __slots__ = ("key", "value")
        KEY_FIELD_NUMBER: _ClassVar[int]
        VALUE_FIELD_NUMBER: _ClassVar[int]
        key: str
        value: str
        def __init__(self, key: _Optional[str] = ..., value: _Optional[str] = ...) -> None: ...
    COOKIE_DATA_FIELD_NUMBER: _ClassVar[int]
    cookie_data: _containers.ScalarMap[str, str]
    def __init__(self, cookie_data: _Optional[_Mapping[str, str]] = ...) -> None: ...

class RunAgentRequest(_message.Message):
    __slots__ = ("prompt", "session_id", "is_chat_request", "request_api_key", "parent_span_context", "model_provider", "model", "enable_thinking", "cookies")
    PROMPT_FIELD_NUMBER: _ClassVar[int]
    SESSION_ID_FIELD_NUMBER: _ClassVar[int]
    IS_CHAT_REQUEST_FIELD_NUMBER: _ClassVar[int]
    REQUEST_API_KEY_FIELD_NUMBER: _ClassVar[int]
    PARENT_SPAN_CONTEXT_FIELD_NUMBER: _ClassVar[int]
    MODEL_PROVIDER_FIELD_NUMBER: _ClassVar[int]
    MODEL_FIELD_NUMBER: _ClassVar[int]
    ENABLE_THINKING_FIELD_NUMBER: _ClassVar[int]
    COOKIES_FIELD_NUMBER: _ClassVar[int]
    prompt: str
    session_id: str
    is_chat_request: bool
    request_api_key: str
    parent_span_context: str
    model_provider: ModelProvider
    model: str
    enable_thinking: bool
    cookies: _containers.RepeatedCompositeFieldContainer[Cookie]
    def __init__(self, prompt: _Optional[str] = ..., session_id: _Optional[str] = ..., is_chat_request: bool = ..., request_api_key: _Optional[str] = ..., parent_span_context: _Optional[str] = ..., model_provider: _Optional[_Union[ModelProvider, str]] = ..., model: _Optional[str] = ..., enable_thinking: bool = ..., cookies: _Optional[_Iterable[_Union[Cookie, _Mapping]]] = ...) -> None: ...

class ActionResult(_message.Message):
    __slots__ = ("is_done", "content", "error", "give_control")
    IS_DONE_FIELD_NUMBER: _ClassVar[int]
    CONTENT_FIELD_NUMBER: _ClassVar[int]
    ERROR_FIELD_NUMBER: _ClassVar[int]
    GIVE_CONTROL_FIELD_NUMBER: _ClassVar[int]
    is_done: bool
    content: str
    error: str
    give_control: bool
    def __init__(self, is_done: bool = ..., content: _Optional[str] = ..., error: _Optional[str] = ..., give_control: bool = ...) -> None: ...

class StepChunkContent(_message.Message):
    __slots__ = ("action_result", "summary", "trace_id")
    ACTION_RESULT_FIELD_NUMBER: _ClassVar[int]
    SUMMARY_FIELD_NUMBER: _ClassVar[int]
    TRACE_ID_FIELD_NUMBER: _ClassVar[int]
    action_result: ActionResult
    summary: str
    trace_id: str
    def __init__(self, action_result: _Optional[_Union[ActionResult, _Mapping]] = ..., summary: _Optional[str] = ..., trace_id: _Optional[str] = ...) -> None: ...

class AgentOutput(_message.Message):
    __slots__ = ("result", "cookies", "trace_id", "step_count")
    RESULT_FIELD_NUMBER: _ClassVar[int]
    COOKIES_FIELD_NUMBER: _ClassVar[int]
    TRACE_ID_FIELD_NUMBER: _ClassVar[int]
    STEP_COUNT_FIELD_NUMBER: _ClassVar[int]
    result: ActionResult
    cookies: _containers.RepeatedCompositeFieldContainer[Cookie]
    trace_id: str
    step_count: int
    def __init__(self, result: _Optional[_Union[ActionResult, _Mapping]] = ..., cookies: _Optional[_Iterable[_Union[Cookie, _Mapping]]] = ..., trace_id: _Optional[str] = ..., step_count: _Optional[int] = ...) -> None: ...

class RunAgentResponseStreamChunk(_message.Message):
    __slots__ = ("step_chunk_content", "agent_output")
    STEP_CHUNK_CONTENT_FIELD_NUMBER: _ClassVar[int]
    AGENT_OUTPUT_FIELD_NUMBER: _ClassVar[int]
    step_chunk_content: StepChunkContent
    agent_output: AgentOutput
    def __init__(self, step_chunk_content: _Optional[_Union[StepChunkContent, _Mapping]] = ..., agent_output: _Optional[_Union[AgentOutput, _Mapping]] = ...) -> None: ...
