from python_executor.code_executor_grpc_pb2 import (
    Arg,
    ChatMessageContent,
    ChatMessageList,
    ExecuteCodeResponse,
    HandleType,
    StringList,
)
from python_executor.lmnr_types import ChatMessage


def handle_string(
    exec_result: str, expected_return_type: HandleType
) -> ExecuteCodeResponse:
    if (
        expected_return_type != HandleType.ANY
        and expected_return_type != HandleType.STRING
    ):
        return ExecuteCodeResponse(
            error=ExecuteCodeResponse.ErrorMessage(
                message=f"Got str, expected {HandleType.Name(expected_return_type)} as the return type of the function"
            )
        )
    return ExecuteCodeResponse(result=Arg(string_value=exec_result))


def handle_empty_list(expected_return_type: HandleType) -> ExecuteCodeResponse:
    if expected_return_type == HandleType.CHAT_MESSAGE_LIST:
        return ExecuteCodeResponse(
            result=Arg(messages_value=ChatMessageList(messages=[]))
        )
    elif (
        expected_return_type == HandleType.STRING_LIST
        or expected_return_type == HandleType.ANY
    ):
        return ExecuteCodeResponse(result=Arg(string_list_value=StringList(values=[])))

    return ExecuteCodeResponse(
        error=ExecuteCodeResponse.ErrorMessage(
            message="Empty list is only supported for ChatMessageList and StringList"
        )
    )


def handle_string_list(
    exec_result: list[str], expected_return_type: HandleType
) -> ExecuteCodeResponse:
    if (
        expected_return_type != HandleType.ANY
        and expected_return_type != HandleType.STRING_LIST
    ):
        return ExecuteCodeResponse(
            error=ExecuteCodeResponse.ErrorMessage(
                message=f"Got list[str], expected {HandleType.Name(expected_return_type)} as the return type of the function"
            )
        )
    return ExecuteCodeResponse(
        result=Arg(string_list_value=StringList(values=exec_result))
    )


def handle_chat_message_list(
    exec_result: list[ChatMessage], expected_return_type: HandleType
) -> ExecuteCodeResponse:
    if (
        expected_return_type != HandleType.ANY
        and expected_return_type != HandleType.CHAT_MESSAGE_LIST
    ):
        return ExecuteCodeResponse(
            error=ExecuteCodeResponse.ErrorMessage(
                message=f"Got list[ChatMessage], expected {HandleType.Name(expected_return_type)} as the return type of the function"
            )
        )
    if not all(isinstance(message.content, str) for message in exec_result):
        return ExecuteCodeResponse(
            error=ExecuteCodeResponse.ErrorMessage(
                message="the content of ChatMessage must be str, images will be supported later"
            )
        )
    chat_messages = [
        ChatMessageList.ChatMessage(
            role=message.role, content=ChatMessageContent(text=message.content)
        )
        for message in exec_result
    ]
    return ExecuteCodeResponse(
        result=Arg(messages_value=ChatMessageList(messages=chat_messages))
    )


def handle_float(
    exec_result: float, expected_return_type: HandleType
) -> ExecuteCodeResponse:
    if (
        expected_return_type != HandleType.ANY
        and expected_return_type != HandleType.FLOAT
    ):
        return ExecuteCodeResponse(
            error=ExecuteCodeResponse.ErrorMessage(
                message=f"Got float, expected {HandleType.Name(expected_return_type)} as the return type of the function"
            )
        )
    return ExecuteCodeResponse(result=Arg(float_value=float(exec_result)))

def handle_bool(
    exec_result: bool, expected_return_type: HandleType
) -> ExecuteCodeResponse:
    if expected_return_type != HandleType.ANY:
        return ExecuteCodeResponse(
            error=ExecuteCodeResponse.ErrorMessage(
                message=f"Got bool, expected {HandleType.Name(expected_return_type)} as the return type of the function"
            )
        )
    return ExecuteCodeResponse(result=Arg(bool_value=bool(exec_result)))
