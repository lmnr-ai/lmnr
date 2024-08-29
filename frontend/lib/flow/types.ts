import { Edge, type Node } from 'reactflow'
import { ChatMessage } from '../types'
import { GraphMessage } from '../pipeline/types'
import { Dataset } from '../dataset/types'

export enum NodeType {
  INPUT = 'Input',
  OUTPUT = 'Output',
  ERROR = 'Error',
  STRING_TEMPLATE = 'StringTemplate',
  SUBPIPELINE = 'Subpipeline',
  MAP = 'Map',
  SEMANTIC_SEARCH = 'SemanticSearch',
  ZENGUARD = 'Zenguard',
  SEMANTIC_SWITCH = 'SemanticSwitch',
  CONDITION = 'Condition',
  FORMAT_VALIDATOR = 'FormatValidator',
  EXTRACTOR = 'Extractor',
  JSON_EXTRACTOR = 'JsonExtractor',
  LLM = 'LLM',
  WEB_SEARCH = 'WebSearch',
  SWITCH = 'Switch',
  CODE = 'Code',
  TOOL_CALL = 'ToolCall',
  FUNCTION = 'Function',
  SEMANTIC_SIMILARITY = 'SemanticSimilarity',
  CODE_SANDBOX = 'CodeSandbox',
}

export interface GenericNode {
  version?: number
  collapsed?: boolean
  isCondtional?: boolean
  id: string
  name: string
  type: NodeType
  inputs: GenericNodeHandle[]
  dynamicInputs?: GenericNodeHandle[]
  inputsMappings?: Record<string, string>
  outputs: GenericNodeHandle[]
}

export interface GenericNodeHandle {
  id: string
  name?: string
  type: NodeHandleType
  secondType?: NodeHandleType
  // Cyclic handles are input handles that may be visited more than once during
  // the execution. We need to reset their values after each node execution,
  // so that they don't keep the value from the previous execution of the loop.

  // Example in format (handle)node:
  // 1. input -> (h1)node1 -> (h1)node2 -> (h1)output
  //                 (h2)           |
  //                   ^------------'
  // In this case h2 is a cyclic handle and node1 may start with the value from the previous execution
  // In the back-end engine, we will reset the value of h2 after each execution of node1, but keep the value of h1
  isCyclic?: boolean
}

export enum NodeHandleType {
  STRING = 'String',
  STRING_LIST = 'StringList',
  CHAT_MESSAGE_LIST = 'ChatMessageList',
  FLOAT = 'Float',
  ANY = 'Any',
}

export interface NodeData extends Node {
  data: GenericNode
}

export interface InputNode extends GenericNode {
  inputType: NodeHandleType
}

export interface OutputNode extends GenericNode {
  inputType: NodeHandleType
}

export interface ErrorNode extends GenericNode {
  inputType: NodeHandleType
}

export interface StringTemplateNode extends GenericNode {
  text: string
}

export interface SubpipelineNode extends GenericNode {
  pipelineName: string
  pipelineId: string | null
  pipelineVersionName: string
  pipelineVersionId: string | null
  runnableGraph: RunnableGraph
}

export interface MapNode extends GenericNode {
  pipelineName: string
  pipelineId: string | null
  pipelineVersionName: string
  pipelineVersionId: string | null
  runnableGraph: RunnableGraph
}

export interface SemantiSwitchRoute {
  name: string
  examples: string[]
}

export interface SemanticSwitchNode extends GenericNode {
  routes: SemantiSwitchRoute[]
}

export interface Route {
  name: string
}

export interface RouterNode extends GenericNode {
  routes: Route[]
  hasDefaultRoute: boolean
}

export interface ConditionNode extends GenericNode {
  condition: string
}

export interface CodeSandboxNode extends GenericNode {
  enableErrorPassing: boolean
}

export interface LLMNode extends GenericNode {
  model?: string
  modelParams?: string
  prompt: string
  semanticCacheEnabled?: boolean
  semanticCacheDatasetId?: string
  semanticSimilarityThreshold?: number
  semanticCacheDataKey?: string
  stream?: boolean
  structuredOutputEnabled?: boolean
  structuredOutputMaxRetries?: number
  structuredOutputSchema?: string | null
  structuredOutputSchemaTarget?: string | null
}

export interface UnifyThreshold {
  float: number
  metric: string
}

export interface UnifyNode extends GenericNode {
  uploadedBy: string,
  modelName: string,
  providerName: string,
  metrics: UnifyThreshold[]
  modelParams?: Record<string, any> | null
  prompt: string
}

export interface CodeNode extends GenericNode {
  code: string,
  fnName: string,
}

export type DetectorType = "prompt_injection" | "pii" | "topics/allowed" | "topics/banned" | "keywords" | "secrets";

export interface Detector {
  type: DetectorType,
  enabled: boolean,
}

export interface ZenguardNode extends GenericNode {
  detectors: Detector[]
}

export interface WebSearchNode extends GenericNode {
  limit: number
  template: string
  semanticTextSearchEnabled?: boolean
  semanticTextSearchLimit?: number
}


export interface SemanticSearchNode extends GenericNode {
  limit: number
  threshold: number
  template: string
  datasets: Dataset[]
}

export interface FormatValidatorNode extends GenericNode {
  format: string
}

export interface ExtractorNode extends GenericNode {
  format: string
}

export interface JsonExtractorNode extends GenericNode {
  template: string;
}

// for now, node name must match the function being called
export interface ToolCallNode extends GenericNode { };

export interface FunctionNode extends GenericNode {
  parameterNames: string[];
}

export interface SemanticSimilarityNode extends GenericNode { };

export type ConditionValue = {
  condition: string
  value: string
}
export type NodeInput = string | string[] | ChatMessage[] | number | ConditionValue;

export type RunnableGraph = {
  nodes: Record<string, GenericNode>
  pred: Record<string, string[]>
}

export type DisplayableGraph = {
  nodes: Node[]
  edges: Edge[]
}

export interface Trace {
  [key: string]: GraphMessage
}
