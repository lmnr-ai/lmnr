import { RunnableGraph, DisplayableGraph, NodeInput, NodeHandleType } from "@/lib/flow/types"

export type PipelineType = 'WORKSHOP' | 'COMMIT'
export type PipelineVisibility = 'PUBLIC' | 'PRIVATE'

export type Pipeline = {
  id: string
  name: string
  projectId?: string
  createdAt?: string
  visibility?: PipelineVisibility
  targetVersionId: string | null
}

export type PipelineVersion = {
  id?: string
  pipelineId: string
  name: string
  displayableGraph: DisplayableGraph
  runnableGraph: RunnableGraph
  pipelineType: PipelineType
  createdAt: string
}

export type PipelineVersionInfo = {
  id: string
  name: string
  createdAt: string
  pipelineId: string
  pipelineType: PipelineType
}

export type EndpointPipelineVersion = {
  endpointId: string
  pipelineVersionId: string
  checkJobIds: string[]
  name?: string
  runnableGraph: RunnableGraph
  deployedAt: string
}

export type GraphMessagePreview = {
  id: string
  startTime: string
  endTime: string
  nodeId: string
  nodeName: string
  nodeType: string
  inputMessageIds: string[]
}

export type GraphMessage = GraphMessagePreview & {
  value: NodeInput
  inputs?: GraphMessage[]
  metaLog: any
}

export type TemplateInfo = {
  id: string;
  name: string;
  description: string;
  displayGroup: string;
}

/**
 * Frontend side type for handling input variables
 * 
 * Not supposed to be serialized/deserialized and sent to backend.
 * 
 * pipelineVersionId and executionId are used to identify the input variable
 * 
 * "Execution" is a bit misleading name. It's not a single pipeline run, but is
 * rather a single set of inputs for a pipeline version. Purely frontend concept.
 */
export type InputVariable = {
  id: string
  name: string
  value: NodeInput
  type: NodeHandleType
  executionId: string
}

export enum PipelineExecutionMode {
  Pipeline = 'pipeline',
  Node = 'node',
}

export type NodeStreamChunk = {
  id: string
  nodeId: string
  nodeName: string
  nodeType: string
  content: NodeInput
}

export type BreakpointChunk = {
  nodeId: string
}

export type LanguageModel = {
  id: string;
  name: string;
}

const providerMapping: { provider: string, models: LanguageModel[] }[] = [
  {
    provider: "openai",
    models: [
      {
        id: "openai:gpt-3.5-turbo",
        name: "openai:gpt-3.5-turbo"
      },
      {
        id: "openai:gpt-3.5-turbo-16k",
        name: "openai:gpt-3.5-turbo-16k"
      },
      {
        id: "openai:gpt-4-turbo",
        name: "openai:gpt-4-turbo"
      },
      {
        id: "openai:gpt-4o",
        name: "openai:gpt-4o"
      },
      {
        id: "openai:gpt-4o-mini",
        name: "openai:gpt-4o-mini"
      }
    ]
  },
  {
    provider: "anthropic",
    models: [
      {
        id: "anthropic:claude-3-haiku-20240307",
        name: "anthropic:claude-3-haiku"
      },
      {
        id: "anthropic:claude-3-sonnet-20240229",
        name: "anthropic:claude-3-sonnet"
      },
      {
        id: "anthropic:claude-3-opus-20240229",
        name: "anthropic:claude-3-opus"
      },
      {
        id: "anthropic:claude-3-5-sonnet-20240620",
        name: "anthropic:claude-3-5-sonnet"
      }
    ]
  },
  {
    provider: "gemini",
    models: [
      {
        id: "gemini:gemini-1.5-flash",
        name: "gemini:1.5-flash"
      },
      {
        id: "gemini:gemini-1.5-pro",
        name: "gemini:1.5-pro"
      }
    ]
  },
  {
    provider: "groq",
    models: [
      {
        id: "groq:llama-3.1-405b-reasoning",
        name: "qroq:llama-3.1-405b-reasoning"
      },
      {
        id: "groq:llama-3.1-70b-versatile",
        name: "qroq:llama-3.1-70b-versatile"
      },
      {
        id: "groq:llama-3.1-8b-instant",
        name: "qroq:llama-3.1-8b-instant"
      },
      {
        id: "groq:llama3-groq-8b-8192-tool-use-preview",
        name: "groq:llama3-groq-8b-8192-tool-use-preview"
      },
      {
        id: "groq:llama3-8b-8192",
        name: "groq:llama3-8b-8192"
      },
      {
        id: "groq:llama3-70b-8192",
        name: "groq:llama3-70b-8192"
      },
      {
        id: "groq:mixtral-8x7b-32768",
        name: "groq:mixtral-8x7b-32768"
      },
      {
        id: "groq:gemma2-9b-it",
        name: "groq:gemma2-9b-it"
      },
      {
        id: "groq:gemma-7b-it",
        name: "groq:gemma-7b-it"
      }
    ]
  },
  {
    provider: "mistral",
    models: [
      {
        id: "mistral:mistral-small",
        name: "mistral:mistral-small"
      },
      {
        id: "mistral:mistral-tiny",
        name: "mistral:mitsral-tiny"
      }
    ]
  },
  {
    provider: "bedrock",
    models: [
      {
        id: "bedrock:anthropic.claude-v2",
        name: "bedrock:anthropic.claude-v2"
      },
      {
        id: "bedrock:anthropic.claude-v2:1",
        name: "bedrock:anthropic.claude-v2:1"
      },
      {
        id: "bedrock:anthropic.claude-3-sonnet-20240229-v1:0",
        name: "bedrock:anthropic.claude-3-sonnet-20240229-v1:0"
      },
      {
        id: "bedrock:anthropic.claude-3-5-sonnet-20240620-v1:0",
        name: "bedrock:anthropic.claude-3-5-sonnet-20240620-v1:0"
      },
      {
        id: "bedrock:anthropic.claude-3-haiku-20240307-v1:0",
        name: "bedrock:anthropic.claude-3-haiku-20240307-v1:0"
      },
      {
        id: "bedrock:anthropic.claude-3-opus-20240229-v1:0",
        name: "bedrock:anthropic.claude-3-opus-20240229-v1:0"
      },
      {
        id: "bedrock:anthropic.claude-instant-v1",
        name: "bedrock:anthropic.claude-instant-v1"
      }
    ]
  },
  {
    provider: "openai-azure",
    models: [
      {
        id: "openai-azure:gpt",
        name: "openai-azure:gpt"
      }
    ]
  }
];

export const PROVIDERS = providerMapping.map(provider => provider.provider);
export const LANGUAGE_MODELS = providerMapping.flatMap(provider => provider.models);
