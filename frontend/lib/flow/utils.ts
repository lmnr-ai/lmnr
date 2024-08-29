import { v4 as uuidv4 } from 'uuid'
import {
  type GenericNode,
  NodeType,
  NodeHandleType,
  type SemanticSearchNode,
  StringTemplateNode,
  InputNode,
  SemanticSwitchNode,
  NodeInput,
  FormatValidatorNode,
  ExtractorNode,
  ZenguardNode,
  WebSearchNode,
  ErrorNode,
  CodeNode,
  JsonExtractorNode,
  SubpipelineNode,
  RunnableGraph,
  LLMNode,
  ToolCallNode,
  FunctionNode,
  MapNode,
  CodeSandboxNode
} from './types'
import { ChatMessage, ChatMessageContentPart } from '../types'
import { generateShortHash, isStringType } from '../utils'

import InputNodePreview from '@/assets/pipeline/node-previews/input-node-preview.png'
import OutputNodePreview from '@/assets/pipeline/node-previews/output-node-preview.png'
import StringTemplateNodePreview from '@/assets/pipeline/node-previews/string-template-node-preview.png'
import JsonExtractorNodePreview from '@/assets/pipeline/node-previews/json-extractor-node-preview.png'
import SubpipelineNodePreview from '@/assets/pipeline/node-previews/subpipeline-node-preview.png'
import MapNodePreview from '@/assets/pipeline/node-previews/map-node-preview.png'
import SwitchNodePreview from '@/assets/pipeline/node-previews/switch-node-preview.png'
import SemanticSwitchNodePreview from '@/assets/pipeline/node-previews/semantic-switch-node-preview.png'
import LLMNodePreview from '@/assets/pipeline/node-previews/llm-node-preview.png'
import CodeNodePreview from '@/assets/pipeline/node-previews/code-node-preview.png'
import CodeSandboxNodePreview from '@/assets/pipeline/node-previews/code-sandbox-node-preview.png'
import ToolCallNodePreview from '@/assets/pipeline/node-previews/tool-call-node-preview.png'
import FunctionNodePreview from '@/assets/pipeline/node-previews/function-node-preview.png'
import SemanticSearchNodePreview from '@/assets/pipeline/node-previews/semantic-search-node-preview.png'
import WebSearchNodePreview from '@/assets/pipeline/node-previews/web-search-node-preview.png'
import SemanticSimilarityNodePreview from '@/assets/pipeline/node-previews/semantic-similarity-node-preview.png'
import { StaticImageData, StaticImport } from 'next/dist/shared/lib/get-img-props';
import { DEFAULT_CODE } from '@/components/pipeline/nodes/code'

export const NODE_TYPE_TO_DOCS = {
  [NodeType.INPUT]: 'https://docs.lmnr.ai/nodes/input-output',
  [NodeType.OUTPUT]: 'https://docs.lmnr.ai/nodes/input-output',
  [NodeType.ERROR]: 'https://docs.lmnr.ai/nodes/error-node',
  [NodeType.STRING_TEMPLATE]: 'https://docs.lmnr.ai/nodes/string-template',
  [NodeType.SUBPIPELINE]: 'https://docs.lmnr.ai/nodes/subpipeline',
  [NodeType.MAP]: 'https://docs.lmnr.ai/nodes/map',
  [NodeType.SEMANTIC_SEARCH]: 'https://docs.lmnr.ai/nodes/semantic-search',
  [NodeType.ZENGUARD]: 'https://docs.lmnr.ai/nodes/zenguard',
  [NodeType.SEMANTIC_SWITCH]: 'https://docs.lmnr.ai/nodes/semantic-switch',
  [NodeType.CONDITION]: 'https://docs.lmnr.ai/nodes/condition',
  [NodeType.FORMAT_VALIDATOR]: 'https://docs.lmnr.ai/nodes/format-validator',
  [NodeType.EXTRACTOR]: 'https://docs.lmnr.ai/nodes/extractor',
  [NodeType.JSON_EXTRACTOR]: 'https://docs.lmnr.ai/nodes/json-extractor',
  [NodeType.LLM]: 'https://docs.lmnr.ai/nodes/LLM',
  [NodeType.WEB_SEARCH]: 'https://docs.lmnr.ai/nodes/web-search',
  [NodeType.SWITCH]: 'https://docs.lmnr.ai/nodes/switch',
  [NodeType.CODE]: 'https://docs.lmnr.ai/nodes/code',
  [NodeType.TOOL_CALL]: 'https://docs.lmnr.ai/nodes/tool-call',
  [NodeType.FUNCTION]: 'https://docs.lmnr.ai/nodes/function-call',
  [NodeType.SEMANTIC_SIMILARITY]: 'https://docs.lmnr.ai/nodes/semantic-similarity',
  [NodeType.CODE_SANDBOX]: 'https://docs.lmnr.ai/nodes/code-sandbox',
}

export const NODE_PREVIEWS: Partial<Record<NodeType, { description: string, imageSrc: StaticImport | StaticImageData, }>> = {
  [NodeType.INPUT]: {
    description: 'Input data into the pipeline. This defines the JSON schema of endpoint requests to Laminar',
    imageSrc: InputNodePreview,
  },
  [NodeType.OUTPUT]: {
    description: 'Output data from the pipeline. This defines the JSON schema of endpoint responses from Laminar',
    imageSrc: OutputNodePreview,
  },
  [NodeType.STRING_TEMPLATE]: {
    description: 'Templated string that creates node input for every {{variable}} and replaces it with the corresponding value',
    imageSrc: StringTemplateNodePreview
  },
  [NodeType.JSON_EXTRACTOR]: {
    description: 'Extract a value from a JSON object using Handlebars syntax',
    imageSrc: JsonExtractorNodePreview
  },
  [NodeType.SUBPIPELINE]: {
    description: 'Run another pipeline in a node',
    imageSrc: SubpipelineNodePreview
  },
  [NodeType.MAP]: {
    description: `Takes a list of strings and runs another pipeline for each string.
    Each element is sent to the pipeline as input, and the output is collected in a list`,
    imageSrc: MapNodePreview,
  },
  [NodeType.SWITCH]: {
    description: 'Conditionaly direct the input to the a branch output based on the exact match to the condition',
    imageSrc: SwitchNodePreview
  },
  [NodeType.SEMANTIC_SWITCH]: {
    description: 'Classify the input based on the semantic similarity to the given classes and direct it to the corresponding branch output',
    imageSrc: SemanticSwitchNodePreview
  },
  [NodeType.LLM]: {
    description: 'Run a Language Model. Supports streaming, tools, params, models from many providers, and structured JSON output',
    imageSrc: LLMNodePreview
  },
  [NodeType.CODE]: {
    description: 'Define any custom Python code to run in the pipeline',
    imageSrc: CodeNodePreview
  },
  [NodeType.CODE_SANDBOX]: {
    description:
      'Dynamically executes any Python code. Useful as a tool helping LLMs reason',
    imageSrc: CodeSandboxNodePreview
  },
  [NodeType.TOOL_CALL]: {
    description: `Call a function defined in your local codebase.
    Takes in an input JSON in the format of OpenAI tool call and calls your local code`,
    imageSrc: ToolCallNodePreview
  },
  [NodeType.FUNCTION]: {
    description: 'Call a function defined in your local codebase. Define the function signature and the node will call the function',
    imageSrc: FunctionNodePreview
  },
  [NodeType.SEMANTIC_SEARCH]: {
    description: 'Search for the most semantically relevant contexts in the dataset. We fully manage the vector DB infrastructure',
    imageSrc: SemanticSearchNodePreview
  },
  [NodeType.WEB_SEARCH]: {
    description: 'Search the web for the most relevant contexts. Uses Google search API',
    imageSrc: WebSearchNodePreview
  },

  [NodeType.SEMANTIC_SIMILARITY]: {
    description: 'Calculate the semantic similarity between two strings',
    imageSrc: SemanticSimilarityNodePreview
  },
};

export function getDefaultGraphInputs(inputNodes: InputNode[]): Record<string, any> {
  const inputs = {} as Record<string, any>

  for (const node of inputNodes) {
    switch (node.inputType) {
      case NodeHandleType.STRING:
        inputs[node.name] = '';
        break;
      case NodeHandleType.CHAT_MESSAGE_LIST:
        inputs[node.name] = [{
          role: 'user',
          content: '',
        }];
        break;
    }
  }

  return inputs;
}

/**
 * Create a new node data object with default values for each node type.
 *
 * The name it generates will be unique with high-probability within the pipeline version/graph.
 * It's needed because otherwise if some nodes have same names, they will override each
 * other's values.
 */
export function createNodeData(id: string, nodeType: NodeType): GenericNode {
  switch (nodeType) {
    case NodeType.INPUT:
      return {
        id,
        type: NodeType.INPUT,
        name: 'Input' + '_' + generateShortHash(),
        inputs: [],
        outputs: [{
          id: uuidv4(),
          name: 'output',
          type: NodeHandleType.STRING // default value
        }],
        input: '',
        inputType: NodeHandleType.STRING
      } as InputNode
    case NodeType.STRING_TEMPLATE:
      return {
        id,
        type: NodeType.STRING_TEMPLATE,
        name: 'String Template' + '_' + generateShortHash(),
        inputs: [],
        outputs: [{
          id: uuidv4(),
          name: 'output',
          type: NodeHandleType.STRING
        }],
        text: '',
        inputsMappings: {}
      } as StringTemplateNode
    case NodeType.SUBPIPELINE:
      return {
        id,
        type: NodeType.SUBPIPELINE,
        name: 'Subpipeline' + '_' + generateShortHash(),
        inputs: [],
        outputs: [{
          id: uuidv4(),
          name: 'output',
          type: NodeHandleType.ANY
        }],
        pipelineName: '',
        pipelineId: null,
        pipelineVersionName: '',
        pipelineVersionId: null,
        runnableGraph: {
          nodes: {},
          pred: {}
        } as RunnableGraph
      } as SubpipelineNode
    case NodeType.MAP:
      return {
        id,
        type: NodeType.MAP,
        name: 'Map' + '_' + generateShortHash(),
        inputs: [{
          id: uuidv4(),
          name: 'inputs',
          type: NodeHandleType.STRING_LIST
        }],
        outputs: [{
          id: uuidv4(),
          name: 'outputs',
          type: NodeHandleType.STRING_LIST
        }],
        pipelineName: '',
        pipelineId: null,
        pipelineVersionName: '',
        pipelineVersionId: null,
        runnableGraph: {
          nodes: {},
          pred: {}
        } as RunnableGraph
      } as MapNode
    case NodeType.SEMANTIC_SEARCH:
      return {
        id,
        type: NodeType.SEMANTIC_SEARCH,
        name: 'Semantic Search' + '_' + generateShortHash(),
        inputs: [{
          id: uuidv4(),
          name: 'query',
          type: NodeHandleType.STRING,
        }],
        outputs: [{
          id: uuidv4(),
          name: 'output',
          type: NodeHandleType.STRING
        }],
        limit: 10,
        threshold: 0.5,
        datasets: [],
        template: '[{{relevance_index}}]\n{{content}}\n---\n',
      } as SemanticSearchNode
    case NodeType.OUTPUT:
      return {
        version: 1,
        id,
        type: NodeType.OUTPUT,
        name: 'Output' + '_' + generateShortHash(),
        inputs: [{
          id: uuidv4(),
          name: 'output',
          type: NodeHandleType.ANY
        }],
        outputs: []
      } as GenericNode
    case NodeType.ERROR:
      return {
        id,
        type: NodeType.ERROR,
        name: 'Error' + '_' + generateShortHash(),
        inputs: [{
          id: uuidv4(),
          name: 'error',
          type: NodeHandleType.ANY
        }],
        inputType: NodeHandleType.STRING,
        outputs: []
      } as ErrorNode
    case NodeType.SEMANTIC_SWITCH:
      return {
        id,
        type: NodeType.SEMANTIC_SWITCH,
        name: 'Semantic Switch' + '_' + generateShortHash(),
        inputs: [{
          id: uuidv4(),
          name: 'input',
          type: NodeHandleType.STRING
        },],
        outputs: [],
        conditionNodes: [],
        routes: [],
        isCondtional: true
      } as SemanticSwitchNode
    case NodeType.FORMAT_VALIDATOR:
      return {
        id,
        type: NodeType.FORMAT_VALIDATOR,
        name: 'Format Validator' + '_' + generateShortHash(),
        inputs: [{
          id: uuidv4(),
          name: 'input',
          type: NodeHandleType.STRING
        }],
        outputs: [{
          id: uuidv4(),
          name: 'correct',
          type: NodeHandleType.STRING
        },
        {
          id: uuidv4(),
          name: 'incorrect',
          type: NodeHandleType.STRING
        }],
        format: '',
        isCondtional: true
      } as FormatValidatorNode
    case NodeType.ZENGUARD:
      return {
        id,
        type: NodeType.ZENGUARD,
        name: 'Zenguard' + '_' + generateShortHash(),
        inputs: [{
          id: uuidv4(),
          name: 'input',
          type: NodeHandleType.STRING
        }],
        outputs: [{
          id: uuidv4(),
          name: 'passthrough',
          type: NodeHandleType.STRING
        },
        {
          id: uuidv4(),
          name: 'block',
          type: NodeHandleType.STRING
        }],
        detectors: [
          { type: "prompt_injection", enabled: false },
          { type: "pii", enabled: false },
          { type: "topics/allowed", enabled: false },
          { type: "topics/banned", enabled: false },
          { type: "keywords", enabled: false },
          { type: "secrets", enabled: false }
        ],
        isCondtional: true
      } as ZenguardNode
    case NodeType.EXTRACTOR:
      return {
        id,
        type: NodeType.EXTRACTOR,
        name: 'Extractor' + '_' + generateShortHash(),
        inputs: [{
          id: uuidv4(),
          name: 'input',
          type: NodeHandleType.STRING
        }],
        outputs: [{
          id: uuidv4(),
          type: NodeHandleType.STRING
        }],
        format: ''
      } as ExtractorNode
    case NodeType.JSON_EXTRACTOR:
      return {
        id,
        type: NodeType.JSON_EXTRACTOR,
        name: 'JSON Extractor' + '_' + generateShortHash(),
        inputs: [{
          id: uuidv4(),
          name: 'input',
          type: NodeHandleType.STRING
        }],
        outputs: [{
          id: uuidv4(),
          type: NodeHandleType.STRING
        }],
        template: ''
      } as JsonExtractorNode
    case NodeType.LLM:
      return {
        id,
        type: NodeType.LLM,
        name: 'LLM' + '_' + generateShortHash(),
        dynamicInputs: [{
          id: uuidv4(),
          name: 'prompt',
          type: NodeHandleType.STRING
        }],
        inputs: [],
        outputs: [{
          id: uuidv4(),
          type: NodeHandleType.STRING
        }],
        model: 'openai:gpt-3.5-turbo',
        prompt: '{{prompt}}',
        modelParams: null,
        stream: false,
      } as GenericNode
    case NodeType.WEB_SEARCH:
      return {
        id,
        type: NodeType.WEB_SEARCH,
        name: 'Web Search' + '_' + generateShortHash(),
        inputs: [{
          id: uuidv4(),
          name: 'query',
          type: NodeHandleType.STRING
        }],
        outputs: [{
          id: uuidv4(),
          type: NodeHandleType.STRING
        }],
        limit: 10,
        template: '{{title}}\n{{url}}\n{{content}}\n---',
        semanticTextSearchEnabled: false,
        semanticTextSearchLimit: 10,
      } as WebSearchNode
    case NodeType.SWITCH:
      return {
        id,
        type: NodeType.SWITCH,
        name: 'Switch' + '_' + generateShortHash(),
        inputs: [
          {
            id: uuidv4(),
            name: 'condition',
            type: NodeHandleType.STRING
          },
          {
            id: uuidv4(),
            name: 'input',
            type: NodeHandleType.ANY
          }],
        outputs: [],
        routes: [],
        hasDefaultRoute: false,
        isCondtional: true
      } as GenericNode
    case NodeType.CODE:
      return {
        id,
        type: NodeType.CODE,
        name: 'Code' + '_' + generateShortHash(),
        inputs: [{
          id: uuidv4(),
          name: 'string_list',
          type: NodeHandleType.STRING_LIST
        },
        {
          id: uuidv4(),
          name: 'chat_messages',
          type: NodeHandleType.CHAT_MESSAGE_LIST
        }],
        outputs: [{
          id: uuidv4(),
          name: 'output',
          type: NodeHandleType.STRING
        }],
        code: DEFAULT_CODE,
        fnName: 'main',
      } as CodeNode
    case NodeType.TOOL_CALL:
      return {
        id,
        type: NodeType.TOOL_CALL,
        name: 'Tool Call' + '_' + generateShortHash(),
        inputs: [{
          id: uuidv4(),
          name: 'input',
          type: NodeHandleType.STRING
        }],
        outputs: [{
          id: uuidv4(),
          name: 'output',
          type: NodeHandleType.STRING
        }]
      } as ToolCallNode
    case NodeType.FUNCTION:
      return {
        id,
        type: NodeType.FUNCTION,
        name: 'Function' + '_' + generateShortHash(),
        inputs: [],
        dynamicInputs: [
          {
            id: uuidv4(),
            name: 'first',
            type: NodeHandleType.ANY
          },
          {
            id: uuidv4(),
            name: 'second',
            type: NodeHandleType.ANY
          }
        ],
        outputs: [{
          id: uuidv4(),
          name: 'output',
          type: NodeHandleType.ANY
        }],
        parameterNames: ['first', 'second']
      } as FunctionNode

    case NodeType.SEMANTIC_SIMILARITY:
      return {
        id,
        type: NodeType.SEMANTIC_SIMILARITY,
        name: 'Semantic Similarity' + '_' + generateShortHash(),
        inputs: [
          {
            id: uuidv4(),
            name: 'first',
            type: NodeHandleType.STRING
          }, {
            id: uuidv4(),
            name: 'second',
            type: NodeHandleType.STRING
          },
        ],
        outputs: [{
          id: uuidv4(),
          name: 'output',
          type: NodeHandleType.FLOAT
        }]
      } as ToolCallNode
    case NodeType.CODE_SANDBOX:
      return {
        id,
        type: NodeType.CODE_SANDBOX,
        name: 'Python Sandbox' + '_' + generateShortHash(),
        inputs: [
          {
            id: uuidv4(),
            name: 'code',
            type: NodeHandleType.STRING
          },
        ],
        outputs: [
          {
            id: uuidv4(),
            name: 'success',
            type: NodeHandleType.ANY
          }
        ],
        enableErrorPassing: false,
        isCondtional: true
      } as CodeSandboxNode
    default:
      throw new Error('Unknown node type')
  }
}

export const DEFAULT_INPUT_VALUE_FOR_HANDLE_TYPE = {
  [NodeHandleType.STRING]: '',
  [NodeHandleType.STRING_LIST]: [''],
  [NodeHandleType.CHAT_MESSAGE_LIST]: [{
    role: 'user',
    content: ''
  }] as ChatMessage[],
  [NodeHandleType.FLOAT]: 0,
  [NodeHandleType.ANY]: '',
}

export function isStringList(input: NodeInput): input is string[] {
  if (input === undefined) return false;
  if (!Array.isArray(input)) return false;
  return input.every((item) => typeof item === 'string');
}

export function isChatMessageList(input: NodeInput): input is ChatMessage[] {
  if (input === undefined) return false;
  if (!Array.isArray(input)) return false;
  return input.every((item) => {
    return typeof item === 'object' && 'role' in item && 'content' in item
  });
}

export const renderChatMessageContentParts = (parts: ChatMessageContentPart[]): string => {
  return parts.map(part => {
    if (part.type === 'text') {
      return part.text
    } else if (part.type === 'image_url') {
      return part.url
    } else {
      let data;
      if (part.data.length <= 30) {
        data = part.data
      } else {
        const firstPart = part.data.slice(0, 10);
        const lastPart = part.data.slice(-10);
        data = `${firstPart}...${lastPart}`;
      }
      return `Image\nMedia type: ${part.mediaType}\nData: ${data}`
    }
  }).join('\n\n')
}

/**
 * Render the node input as a string for display in the UI.
 *
 * IMPORTANT: It must first check for isStringList before isChatMessageList.
 * Because if empty array is passed, we want it to be treated as string list and rendered as "[]".
 */
export const renderNodeInput = (input: NodeInput): string => {
  if (typeof input === 'string') {
    return input as string
  } else if (isStringList(input)) {
    return JSON.stringify(input, null, 2) // `[\n  ${(input as string[]).join(',\n  ')}\n]`
  } else if (isChatMessageList(input)) {
    return (input as ChatMessage[]).map(message => {
      if (isStringType(message.content)) {
        return `${message.role == 'user' ? 'User' : 'Assistant'}:\n${message.content}`
      } else {
        return `${message.role == 'user' ? 'User' : 'Assistant'}:\n${renderChatMessageContentParts(message.content)}`
      }
    })
      .join('\n\n---\n\n')
  } else {
    return JSON.stringify(input, null, 2)
  }
}

export const getDurationString = (startTime: string, endTime: string) => {
  const start = new Date(startTime)
  const end = new Date(endTime)
  const duration = end.getTime() - start.getTime()

  return `${(duration / 1000).toFixed(2)}s`
}

export const getDuration = (startTime: string, endTime: string) => {
  const start = new Date(startTime)
  const end = new Date(endTime)
  return (end.getTime() - start.getTime())
}

/**
 * Quick hack to remove OPENAI_API_KEY for cases where we provide the API keys by ourselves.
 * 
 * NOTE: Use it only for pipeline runs, not for other components such as PipelineEnv, UseAPI, etc.
 */
export const filterRunRequiredEnvVars = (requiredEnvVars: Set<string>, nodes: GenericNode[]): Set<string> => {
  const filteredEnvVars = new Set(requiredEnvVars);

  let removeOpenaiAPIKey = false;
  for (const node of nodes) {
    if (node.type === NodeType.LLM && (node as LLMNode).model?.startsWith('openai:')) {
      if ((node as LLMNode).model?.startsWith('openai:gpt-3.5') || (node as LLMNode).model === 'openai:gpt-4o-mini') {
        removeOpenaiAPIKey = true;
      } else {
        removeOpenaiAPIKey = false;
        break;
      }
    }
  }

  if (removeOpenaiAPIKey) {
    filteredEnvVars.delete('OPENAI_API_KEY');
  }

  return filteredEnvVars;
}
