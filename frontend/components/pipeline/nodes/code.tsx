
import { CodeNode, GenericNodeHandle, NodeHandleType } from '@/lib/flow/types'
import useStore from '@/lib/flow/store';
import { v4 } from 'uuid';
import Editor from '@monaco-editor/react'


export const DEFAULT_CODE = `"""
Implement the function "main" in this module.

IMPORTANT:
1. The function name must be "main".
2. Annotate type of input arguments.
3. Annotate return type of the function.

If one of the condition is not met, the input/output handles won't appear.

Supported types for both inputs and outputs:
- str
- list[str]
- list[ChatMessage]
- float (use float for int as well)

class ChatMessage:
    role: str
    content: str

Output type will be validated at runtime, and this node will fail if the returned
output's type doesn't match the expected type.

Python version: 3.12.3

You can add other functions, if you need, and call them inside "main" function.
Do not remove "main" function, as it is the entry point for the node execution.

Standard libraries are available. The "requests" library can also be used.
External packages will be supported soon. Contact us to join the waitlist!
"""

# add type annotations to arguments and return type to see input/output handles
def main(string_list: list[str], chat_messages: list[ChatMessage]) -> str:
    item = string_list[0]

    assert isinstance(chat_messages[0].content, str)
    return item + chat_messages[0].content
`


type ParsedArgument = {
  name: string;
  type: string;
};

type ParsedFunction = {
  functionName: string;
  returnType: string;
  arguments: ParsedArgument[];
};

const argTypeToNodeHandleType = (returnType: string): NodeHandleType => {
  switch (returnType) {
    case 'str':
      return NodeHandleType.STRING;
    case 'list[str]':
    case 'List[str]':
      return NodeHandleType.STRING_LIST;
    case 'list[ChatMessage]':
    case 'List[ChatMessage]':
      return NodeHandleType.CHAT_MESSAGE_LIST;
    case 'float':
      return NodeHandleType.FLOAT;
    default:
      return NodeHandleType.ANY;
  }
}

const compareArgTypeToHandleType = (argType: string, handleType: NodeHandleType) => {
  switch (argType) {
    case 'str':
      return handleType === NodeHandleType.STRING;
    case 'list[str]':
    case 'List[str]':
      return handleType === NodeHandleType.STRING_LIST;
    case 'list[ChatMessage]':
    case 'List[ChatMessage]':
      return handleType === NodeHandleType.CHAT_MESSAGE_LIST;
    case 'float':
      return handleType === NodeHandleType.FLOAT;
    default:
      return false;
  }
}

const compareArgToHandle = (arg: ParsedArgument, handle: GenericNodeHandle) => {
  return arg.name === handle.name && compareArgTypeToHandleType(arg.type, handle.type);
}

// TODO: Update [^)] to handle only valid Python function arguments
const functionPattern = /def\s+main\(([^)]*)\)\s*->\s*([\w\[\]]+):/;
const argumentPattern = /\s*([\w]+)\s*:\s*([\w\[\]]+)\s*(,|$)/g // /(\w+):\s*(str|list\[str\]|List\[str\]|list\[ChatMessage\]|List\[ChatMessage\]|float)/g;


// Function to parse Python code and extract function details
function parsePythonCode(code: string): ParsedFunction | null {
  const functionMatch = code.match(functionPattern);
  if (!functionMatch) return null;

  const args = functionMatch[1];
  const returnType = functionMatch[2];
  const argMatches = [...args.matchAll(argumentPattern)];

  const argumentsList = argMatches.map(match => ({
    name: match[1],
    type: match[2]
  }));

  return {
    functionName: 'main',
    returnType: returnType,
    arguments: argumentsList
  };
}

export default function Code({
  data,
}: {
  data: CodeNode;
}) {
  const updateNodeData = useStore((state) => state.updateNodeData);
  const dropEdgeForHandle = useStore((state) => state.dropEdgeForHandle);

  return (
    <div className='p-0 w-full h-full flex'>
      <Editor
        language="python"
        theme="vs-dark"
        value={data.code}
        height={'100%'}
        options={{

        }}
        onChange={(code) => {
          const parsedFunction = parsePythonCode(code ?? '');
          if (!!parsedFunction) {
            let newNodeData = {
              code: code,
              fnName: parsedFunction.functionName,
            } as CodeNode;

            if (parsedFunction.arguments.length != data.inputs.length || !parsedFunction.arguments.every((arg, index) => compareArgToHandle(arg, data.inputs[index]))) {
              for (const input of data.inputs) {
                dropEdgeForHandle(input.id);
              }

              newNodeData.inputs = parsedFunction.arguments.map((arg) => ({
                id: v4(),
                name: arg.name,
                type: argTypeToNodeHandleType(arg.type)
              }));
            }

            if (data.outputs.length === 0 || !compareArgTypeToHandleType(parsedFunction.returnType, data.outputs[0].type)) {
              if (data.outputs.length > 0) {
                dropEdgeForHandle(data.outputs[0].id);
              }

              newNodeData.outputs = [{
                id: v4(),
                name: 'output',
                type: argTypeToNodeHandleType(parsedFunction.returnType)
              }];
            }

            updateNodeData(data.id, newNodeData);
          } else {
            for (const input of data.inputs) {
              dropEdgeForHandle(input.id);
            }
            if (data.outputs.length > 0) {
              dropEdgeForHandle(data.outputs[0].id);
            }

            updateNodeData(data.id, {
              code: code ?? '',
              fnName: 'main',
              inputs: [],
              outputs: []
            } as any);
          }
        }} />
    </div>
  );
};