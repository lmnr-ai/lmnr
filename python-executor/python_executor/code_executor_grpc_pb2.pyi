from google.protobuf.internal import containers as _containers
from google.protobuf.internal import enum_type_wrapper as _enum_type_wrapper
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from typing import ClassVar as _ClassVar, Iterable as _Iterable, Mapping as _Mapping, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class HandleType(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    ANY: _ClassVar[HandleType]
    STRING: _ClassVar[HandleType]
    STRING_LIST: _ClassVar[HandleType]
    CHAT_MESSAGE_LIST: _ClassVar[HandleType]
    FLOAT: _ClassVar[HandleType]
ANY: HandleType
STRING: HandleType
STRING_LIST: HandleType
CHAT_MESSAGE_LIST: HandleType
FLOAT: HandleType

class ChatMessageText(_message.Message):
    __slots__ = ("text",)
    TEXT_FIELD_NUMBER: _ClassVar[int]
    text: str
    def __init__(self, text: _Optional[str] = ...) -> None: ...

class ChatMessageImageUrl(_message.Message):
    __slots__ = ("url",)
    URL_FIELD_NUMBER: _ClassVar[int]
    url: str
    def __init__(self, url: _Optional[str] = ...) -> None: ...

class ChatMessageImage(_message.Message):
    __slots__ = ("media_type", "data")
    MEDIA_TYPE_FIELD_NUMBER: _ClassVar[int]
    DATA_FIELD_NUMBER: _ClassVar[int]
    media_type: str
    data: str
    def __init__(self, media_type: _Optional[str] = ..., data: _Optional[str] = ...) -> None: ...

class ChatMessageContentPart(_message.Message):
    __slots__ = ("text", "image_url", "image")
    TEXT_FIELD_NUMBER: _ClassVar[int]
    IMAGE_URL_FIELD_NUMBER: _ClassVar[int]
    IMAGE_FIELD_NUMBER: _ClassVar[int]
    text: ChatMessageText
    image_url: ChatMessageImageUrl
    image: ChatMessageImage
    def __init__(self, text: _Optional[_Union[ChatMessageText, _Mapping]] = ..., image_url: _Optional[_Union[ChatMessageImageUrl, _Mapping]] = ..., image: _Optional[_Union[ChatMessageImage, _Mapping]] = ...) -> None: ...

class ContentPartList(_message.Message):
    __slots__ = ("parts",)
    PARTS_FIELD_NUMBER: _ClassVar[int]
    parts: _containers.RepeatedCompositeFieldContainer[ChatMessageContentPart]
    def __init__(self, parts: _Optional[_Iterable[_Union[ChatMessageContentPart, _Mapping]]] = ...) -> None: ...

class ChatMessageContent(_message.Message):
    __slots__ = ("text", "content_part_list")
    TEXT_FIELD_NUMBER: _ClassVar[int]
    CONTENT_PART_LIST_FIELD_NUMBER: _ClassVar[int]
    text: str
    content_part_list: ContentPartList
    def __init__(self, text: _Optional[str] = ..., content_part_list: _Optional[_Union[ContentPartList, _Mapping]] = ...) -> None: ...

class ChatMessageList(_message.Message):
    __slots__ = ("messages",)
    class ChatMessage(_message.Message):
        __slots__ = ("role", "content")
        ROLE_FIELD_NUMBER: _ClassVar[int]
        CONTENT_FIELD_NUMBER: _ClassVar[int]
        role: str
        content: ChatMessageContent
        def __init__(self, role: _Optional[str] = ..., content: _Optional[_Union[ChatMessageContent, _Mapping]] = ...) -> None: ...
    MESSAGES_FIELD_NUMBER: _ClassVar[int]
    messages: _containers.RepeatedCompositeFieldContainer[ChatMessageList.ChatMessage]
    def __init__(self, messages: _Optional[_Iterable[_Union[ChatMessageList.ChatMessage, _Mapping]]] = ...) -> None: ...

class StringList(_message.Message):
    __slots__ = ("values",)
    VALUES_FIELD_NUMBER: _ClassVar[int]
    values: _containers.RepeatedScalarFieldContainer[str]
    def __init__(self, values: _Optional[_Iterable[str]] = ...) -> None: ...

class Arg(_message.Message):
    __slots__ = ("string_value", "messages_value", "string_list_value", "float_value", "bool_value")
    STRING_VALUE_FIELD_NUMBER: _ClassVar[int]
    MESSAGES_VALUE_FIELD_NUMBER: _ClassVar[int]
    STRING_LIST_VALUE_FIELD_NUMBER: _ClassVar[int]
    FLOAT_VALUE_FIELD_NUMBER: _ClassVar[int]
    BOOL_VALUE_FIELD_NUMBER: _ClassVar[int]
    string_value: str
    messages_value: ChatMessageList
    string_list_value: StringList
    float_value: float
    bool_value: bool
    def __init__(self, string_value: _Optional[str] = ..., messages_value: _Optional[_Union[ChatMessageList, _Mapping]] = ..., string_list_value: _Optional[_Union[StringList, _Mapping]] = ..., float_value: _Optional[float] = ..., bool_value: bool = ...) -> None: ...

class ExecuteCodeRequest(_message.Message):
    __slots__ = ("code", "fn_name", "args", "return_type")
    class ArgsEntry(_message.Message):
        __slots__ = ("key", "value")
        KEY_FIELD_NUMBER: _ClassVar[int]
        VALUE_FIELD_NUMBER: _ClassVar[int]
        key: str
        value: Arg
        def __init__(self, key: _Optional[str] = ..., value: _Optional[_Union[Arg, _Mapping]] = ...) -> None: ...
    CODE_FIELD_NUMBER: _ClassVar[int]
    FN_NAME_FIELD_NUMBER: _ClassVar[int]
    ARGS_FIELD_NUMBER: _ClassVar[int]
    RETURN_TYPE_FIELD_NUMBER: _ClassVar[int]
    code: str
    fn_name: str
    args: _containers.MessageMap[str, Arg]
    return_type: HandleType
    def __init__(self, code: _Optional[str] = ..., fn_name: _Optional[str] = ..., args: _Optional[_Mapping[str, Arg]] = ..., return_type: _Optional[_Union[HandleType, str]] = ...) -> None: ...

class ExecuteCodeResponse(_message.Message):
    __slots__ = ("result", "error")
    class ErrorMessage(_message.Message):
        __slots__ = ("message",)
        MESSAGE_FIELD_NUMBER: _ClassVar[int]
        message: str
        def __init__(self, message: _Optional[str] = ...) -> None: ...
    RESULT_FIELD_NUMBER: _ClassVar[int]
    ERROR_FIELD_NUMBER: _ClassVar[int]
    result: Arg
    error: ExecuteCodeResponse.ErrorMessage
    def __init__(self, result: _Optional[_Union[Arg, _Mapping]] = ..., error: _Optional[_Union[ExecuteCodeResponse.ErrorMessage, _Mapping]] = ...) -> None: ...
