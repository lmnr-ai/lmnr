from concurrent import futures

import logging
from python_executor.log import VerboseColorfulFormatter
import grpc
from python_executor.code_executor_grpc_pb2 import (
    ExecuteCodeRequest,
    ExecuteCodeResponse,
    ChatMessageList,
    Arg,
    HandleType,
    StringList,
)
from python_executor.code_executor_grpc_pb2_grpc import (
    add_CodeExecutorServicer_to_server,
)
from python_executor.code_executor_grpc_pb2_grpc import (
    CodeExecutorServicer as GrpcCodeExecutorServicer,
)
from python_executor.lmnr_types import ChatMessage
from typing import Any

from python_executor.utils import (
    handle_bool,
    handle_chat_message_list,
    handle_empty_list,
    handle_float,
    handle_string,
    handle_string_list,
)

PORT = 8811

LOGGER = logging.getLogger("python_code_executor")
console_log_handler = logging.StreamHandler()
console_log_handler.setFormatter(VerboseColorfulFormatter())
console_log_handler.setLevel(logging.DEBUG)
LOGGER.addHandler(console_log_handler)
LOGGER.setLevel(logging.DEBUG)
logging.basicConfig()


def indent(s: str) -> str:
    return "\n".join([f"    {line}" for line in s.split("\n")])


"""
Returns assignment string, e.g. "msg = ChatMessage(role='bot', content='Hello')"
"""


def to_assignment_str(var: str, arg: Arg) -> str:
    fieldname = arg.WhichOneof("value")
    data = getattr(arg, fieldname)
    if isinstance(data, ChatMessageList):
        for message in data.messages:
            content_type = message.content.WhichOneof("value")
            if content_type != "text":
                raise Exception(
                    "only text is supported in ChatMessage. Images will be supported later."
                )
        chat_messages_str = ", ".join(
            [
                f"ChatMessage(role={repr(message.role)}, content={repr(message.content.text)})"
                for message in data.messages
            ]
        )
        return f"{var} = [{chat_messages_str}]"

    elif isinstance(data, StringList):
        str_list = [s for s in data.values]
        return f"{var} = {repr(str_list)}"

    elif isinstance(data, float):
        return f"{var} = {repr(data)}"
    
    elif isinstance(data, bool):
        return f"{var} = {repr(data)}"

    assert isinstance(data, str), f"Unexpected data type: {type(data)}"
    return f"{var} = {repr(data)}"


def to_response(
    exec_result: Any, expected_return_type: HandleType
) -> ExecuteCodeResponse:
    if isinstance(exec_result, str):
        return handle_string(exec_result, expected_return_type)

    elif isinstance(exec_result, list):
        if len(exec_result) == 0:
            return handle_empty_list(expected_return_type)

        elif all(isinstance(item, str) for item in exec_result):
            return handle_string_list(exec_result, expected_return_type)

        elif all(isinstance(item, ChatMessage) for item in exec_result):
            return handle_chat_message_list(exec_result, expected_return_type)

    # both float and int will be treated as float
    elif isinstance(exec_result, (float, int)):
        return handle_float(exec_result, expected_return_type)
    
    elif isinstance(exec_result, bool):
        return handle_bool(exec_result, expected_return_type)

    return ExecuteCodeResponse(
        error=ExecuteCodeResponse.ErrorMessage(
            message=f"Returned value must be either str, list[str], list[ChatMessage], or float, received {type(exec_result)}"
        )
    )


def execute_code(request: ExecuteCodeRequest) -> ExecuteCodeResponse:
    fn_name = request.fn_name
    code = request.code
    assignments = [to_assignment_str(k, v) for k, v in request.args.items()]
    fn_args_str = ", ".join(f"{k}={k}" for k in request.args.keys())

    return_type = request.return_type
    local_vars = {}

    exec_code = (
        "def run_wrapper():"
        + "\n"
        + indent("\n".join(assignments))
        + "\n"
        + indent(code.strip())
        + "\n"
        + indent(f"return {fn_name}({fn_args_str})")
    )

    # TODO: once we have per-workspace code executor machine, we should write
    # code into separate files and then do something like https://stackoverflow.com/a/3071

    # 1. define the function
    try:
        exec(exec_code, None, local_vars)
    except Exception as e:
        error_msg = f"Error while registering the function: {e}"
        LOGGER.warning(error_msg)
        return ExecuteCodeResponse(
            error=ExecuteCodeResponse.ErrorMessage(message=error_msg)
        )

    # 2. execute the function
    try:
        exec_result = local_vars.get("run_wrapper")()  # type: ignore
        return to_response(exec_result, expected_return_type=return_type)
    except Exception as e:
        error_msg = f"Error while executing the function: {e}"
        LOGGER.warning(error_msg)
        return ExecuteCodeResponse(
            error=ExecuteCodeResponse.ErrorMessage(message=error_msg)
        )


class CodeExecutorServicer(GrpcCodeExecutorServicer):
    def Execute(self, request, context):
        return execute_code(request)


def serve():
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=8))
    add_CodeExecutorServicer_to_server(CodeExecutorServicer(), server)
    server.add_insecure_port(f"[::]:{PORT}")
    server.start()
    
    try:
        server.wait_for_termination()
    except KeyboardInterrupt:
        server.stop(0)


if __name__ == "__main__":
    serve()
