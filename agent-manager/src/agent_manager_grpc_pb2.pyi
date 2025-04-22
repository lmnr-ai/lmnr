from google.protobuf.internal import enum_type_wrapper as _enum_type_wrapper
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from typing import ClassVar as _ClassVar, Mapping as _Mapping, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class ModelProvider(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    ANTHROPIC: _ClassVar[ModelProvider]
    BEDROCK: _ClassVar[ModelProvider]
ANTHROPIC: ModelProvider
BEDROCK: ModelProvider

class RunAgentRequest(_message.Message):
    __slots__ = ("prompt", "session_id", "is_chat_request", "request_api_key", "cdp_url", "parent_span_context", "model_provider", "model", "enable_thinking", "return_screenshots", "return_agent_state", "return_storage_state", "storage_state", "agent_state", "timeout", "max_steps", "thinking_token_budget", "start_url")
    PROMPT_FIELD_NUMBER: _ClassVar[int]
    SESSION_ID_FIELD_NUMBER: _ClassVar[int]
    IS_CHAT_REQUEST_FIELD_NUMBER: _ClassVar[int]
    REQUEST_API_KEY_FIELD_NUMBER: _ClassVar[int]
    CDP_URL_FIELD_NUMBER: _ClassVar[int]
    PARENT_SPAN_CONTEXT_FIELD_NUMBER: _ClassVar[int]
    MODEL_PROVIDER_FIELD_NUMBER: _ClassVar[int]
    MODEL_FIELD_NUMBER: _ClassVar[int]
    ENABLE_THINKING_FIELD_NUMBER: _ClassVar[int]
    RETURN_SCREENSHOTS_FIELD_NUMBER: _ClassVar[int]
    RETURN_AGENT_STATE_FIELD_NUMBER: _ClassVar[int]
    RETURN_STORAGE_STATE_FIELD_NUMBER: _ClassVar[int]
    STORAGE_STATE_FIELD_NUMBER: _ClassVar[int]
    AGENT_STATE_FIELD_NUMBER: _ClassVar[int]
    TIMEOUT_FIELD_NUMBER: _ClassVar[int]
    MAX_STEPS_FIELD_NUMBER: _ClassVar[int]
    THINKING_TOKEN_BUDGET_FIELD_NUMBER: _ClassVar[int]
    START_URL_FIELD_NUMBER: _ClassVar[int]
    prompt: str
    session_id: str
    is_chat_request: bool
    request_api_key: str
    cdp_url: str
    parent_span_context: str
    model_provider: ModelProvider
    model: str
    enable_thinking: bool
    return_screenshots: bool
    return_agent_state: bool
    return_storage_state: bool
    storage_state: str
    agent_state: str
    timeout: int
    max_steps: int
    thinking_token_budget: int
    start_url: str
    def __init__(self, prompt: _Optional[str] = ..., session_id: _Optional[str] = ..., is_chat_request: bool = ..., request_api_key: _Optional[str] = ..., cdp_url: _Optional[str] = ..., parent_span_context: _Optional[str] = ..., model_provider: _Optional[_Union[ModelProvider, str]] = ..., model: _Optional[str] = ..., enable_thinking: bool = ..., return_screenshots: bool = ..., return_agent_state: bool = ..., return_storage_state: bool = ..., storage_state: _Optional[str] = ..., agent_state: _Optional[str] = ..., timeout: _Optional[int] = ..., max_steps: _Optional[int] = ..., thinking_token_budget: _Optional[int] = ..., start_url: _Optional[str] = ...) -> None: ...

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
    __slots__ = ("action_result", "summary", "trace_id", "screenshot")
    ACTION_RESULT_FIELD_NUMBER: _ClassVar[int]
    SUMMARY_FIELD_NUMBER: _ClassVar[int]
    TRACE_ID_FIELD_NUMBER: _ClassVar[int]
    SCREENSHOT_FIELD_NUMBER: _ClassVar[int]
    action_result: ActionResult
    summary: str
    trace_id: str
    screenshot: str
    def __init__(self, action_result: _Optional[_Union[ActionResult, _Mapping]] = ..., summary: _Optional[str] = ..., trace_id: _Optional[str] = ..., screenshot: _Optional[str] = ...) -> None: ...

class AgentOutput(_message.Message):
    __slots__ = ("result", "trace_id", "step_count", "storage_state", "agent_state")
    RESULT_FIELD_NUMBER: _ClassVar[int]
    TRACE_ID_FIELD_NUMBER: _ClassVar[int]
    STEP_COUNT_FIELD_NUMBER: _ClassVar[int]
    STORAGE_STATE_FIELD_NUMBER: _ClassVar[int]
    AGENT_STATE_FIELD_NUMBER: _ClassVar[int]
    result: ActionResult
    trace_id: str
    step_count: int
    storage_state: str
    agent_state: str
    def __init__(self, result: _Optional[_Union[ActionResult, _Mapping]] = ..., trace_id: _Optional[str] = ..., step_count: _Optional[int] = ..., storage_state: _Optional[str] = ..., agent_state: _Optional[str] = ...) -> None: ...

class ErrorChunkContent(_message.Message):
    __slots__ = ("content",)
    CONTENT_FIELD_NUMBER: _ClassVar[int]
    content: str
    def __init__(self, content: _Optional[str] = ...) -> None: ...

class RunAgentResponseStreamChunk(_message.Message):
    __slots__ = ("step_chunk_content", "agent_output", "error_chunk_content", "timeout_chunk_content")
    STEP_CHUNK_CONTENT_FIELD_NUMBER: _ClassVar[int]
    AGENT_OUTPUT_FIELD_NUMBER: _ClassVar[int]
    ERROR_CHUNK_CONTENT_FIELD_NUMBER: _ClassVar[int]
    TIMEOUT_CHUNK_CONTENT_FIELD_NUMBER: _ClassVar[int]
    step_chunk_content: StepChunkContent
    agent_output: AgentOutput
    error_chunk_content: ErrorChunkContent
    timeout_chunk_content: StepChunkContent
    def __init__(self, step_chunk_content: _Optional[_Union[StepChunkContent, _Mapping]] = ..., agent_output: _Optional[_Union[AgentOutput, _Mapping]] = ..., error_chunk_content: _Optional[_Union[ErrorChunkContent, _Mapping]] = ..., timeout_chunk_content: _Optional[_Union[StepChunkContent, _Mapping]] = ...) -> None: ...
