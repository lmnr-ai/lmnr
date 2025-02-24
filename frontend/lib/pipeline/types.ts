import { CheckJobStatus } from "@/lib/check/types";
import { EnvVars } from "@/lib/env/utils";
import { DisplayableGraph, NodeHandleType, NodeInput, RunnableGraph } from "@/lib/flow/types";

export type PipelineType = "WORKSHOP" | "COMMIT";
export type PipelineVisibility = "PUBLIC" | "PRIVATE";

export type Pipeline = {
  id: string;
  name: string;
  projectId?: string;
  createdAt?: string;
  visibility?: PipelineVisibility;
  targetVersionId: string | null;
};

export type PipelineVersion = {
  id?: string;
  pipelineId: string;
  name: string;
  displayableGraph: DisplayableGraph;
  runnableGraph: RunnableGraph;
  pipelineType: PipelineType;
  createdAt: string;
};

export type PipelineVersionInfo = {
  id: string;
  name: string;
  createdAt: string;
  pipelineId: string;
  pipelineType: PipelineType;
};

export type EndpointPipelineVersion = {
  endpointId: string;
  pipelineVersionId: string;
  checkJobsStatus: CheckJobStatus;
  checkJobIds: string[];
  name?: string;
  runnableGraph: RunnableGraph;
  deployedAt: string;
};

export type GraphMessagePreview = {
  id: string;
  startTime: string;
  endTime: string;
  nodeId: string;
  nodeName: string;
  nodeType: string;
  inputMessageIds: string[];
};

export type GraphMessage = GraphMessagePreview & {
  value: NodeInput;
  inputs?: GraphMessage[];
  metaLog: any;
};

export type TemplateInfo = {
  id: string;
  name: string;
  description: string;
  displayGroup: string;
};

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
  id: string;
  name: string;
  value: NodeInput;
  type: NodeHandleType;
  executionId: string;
};

export enum PipelineExecutionMode {
  Pipeline = "pipeline",
  Node = "node",
}

export type NodeStreamChunk = {
  id: string;
  nodeId: string;
  nodeName: string;
  nodeType: string;
  content: NodeInput;
};

export type BreakpointChunk = {
  nodeId: string;
};

export type LanguageModel = {
  id: `${Provider}:${string}`;
  name: string;
};

export type Provider = "openai" | "anthropic" | "gemini" | "groq" | "mistral" | "bedrock" | "openai-azure";

export const providerToApiKey: Record<Provider, EnvVars> = {
  openai: EnvVars.OPENAI_API_KEY,
  anthropic: EnvVars.ANTHROPIC_API_KEY,
  gemini: EnvVars.GEMINI_API_KEY,
  groq: EnvVars.GROQ_API_KEY,
  mistral: EnvVars.MISTRAL_API_KEY,
  bedrock: EnvVars.AWS_ACCESS_KEY_ID,
  "openai-azure": EnvVars.AWS_ACCESS_KEY_ID,
} as const;

export const apiKeyToProvider: Partial<Record<EnvVars, Provider>> = {
  [EnvVars.OPENAI_API_KEY]: "openai",
  [EnvVars.ANTHROPIC_API_KEY]: "anthropic",
  [EnvVars.GEMINI_API_KEY]: "gemini",
  [EnvVars.GROQ_API_KEY]: "groq",
  [EnvVars.MISTRAL_API_KEY]: "mistral",
  [EnvVars.AWS_ACCESS_KEY_ID]: "bedrock",
  [EnvVars.AWS_SECRET_ACCESS_KEY]: "bedrock",
  [EnvVars.AWS_REGION]: "bedrock",
  [EnvVars.OPENAI_AZURE_API_KEY]: "openai-azure",
  [EnvVars.OPENAI_AZUURE_DEPLOYMENT_NAME]: "openai-azure",
  [EnvVars.OPENAI_AZUURE_RESOURCE_ID]: "openai-azure",
} as const;

export const providers: { provider: Provider; models: LanguageModel[] }[] = [
  {
    provider: "openai",
    models: [
      {
        id: "openai:gpt-4o-mini",
        name: "gpt-4o-mini",
      },
      {
        id: "openai:gpt-4-turbo",
        name: "gpt-4-turbo",
      },
      {
        id: "openai:gpt-4o",
        name: "gpt-4o",
      },
      {
        id: "openai:o1-mini",
        name: "o1-mini",
      },
      {
        id: "openai:o1-preview",
        name: "o1-preview",
      },
      {
        id: "openai:o1",
        name: "o1",
      },
      {
        id: "openai:o3-mini",
        name: "o3-mini",
      },
    ],
  },
  {
    provider: "anthropic",
    models: [
      {
        id: "anthropic:claude-3-haiku-20240307",
        name: "claude-3-haiku-20240307",
      },
      {
        id: "anthropic:claude-3-sonnet-20240229",
        name: "claude-3-sonnet-20240229",
      },
      {
        id: "anthropic:claude-3-opus-20240229",
        name: "claude-3-opus-20240229",
      },
      {
        id: "anthropic:claude-3-5-sonnet-20241022",
        name: "claude-3-5-sonnet-20241022",
      },
      {
        id: "anthropic:claude-3-5-haiku-20241022",
        name: "claude-3-5-haiku-20241022",
      },
    ],
  },
  {
    provider: "gemini",
    models: [
      {
        id: "gemini:gemini-1.5-flash",
        name: "1.5-flash",
      },
      {
        id: "gemini:gemini-1.5-pro",
        name: "1.5-pro",
      },
    ],
  },
  {
    provider: "groq",
    models: [
      {
        id: "groq:llama-3.1-405b-reasoning",
        name: "llama-3.1-405b-reasoning",
      },
      {
        id: "groq:llama-3.1-70b-versatile",
        name: "llama-3.1-70b-versatile",
      },
      {
        id: "groq:llama-3.1-8b-instant",
        name: "llama-3.1-8b-instant",
      },
      {
        id: "groq:llama3-groq-8b-8192-tool-use-preview",
        name: "llama3-groq-8b-8192-tool-use-preview",
      },
      {
        id: "groq:llama3-8b-8192",
        name: "llama3-8b-8192",
      },
      {
        id: "groq:llama3-70b-8192",
        name: "llama3-70b-8192",
      },
      {
        id: "groq:mixtral-8x7b-32768",
        name: "mixtral-8x7b-32768",
      },
      {
        id: "groq:gemma2-9b-it",
        name: "gemma2-9b-it",
      },
      {
        id: "groq:gemma-7b-it",
        name: "gemma-7b-it",
      },
    ],
  },
  {
    provider: "mistral",
    models: [
      {
        id: "mistral:mistral-small",
        name: "mistral-small",
      },
      {
        id: "mistral:mistral-tiny",
        name: "mistral-tiny",
      },
    ],
  },
  {
    provider: "bedrock",
    models: [
      {
        id: "bedrock:anthropic.claude-v2",
        name: "anthropic.claude-v2",
      },
      {
        id: "bedrock:anthropic.claude-v2:1",
        name: "anthropic.claude-v2:1",
      },
      {
        id: "bedrock:anthropic.claude-3-sonnet-20240229-v1:0",
        name: "anthropic.claude-3-sonnet-20240229-v1:0",
      },
      {
        id: "bedrock:anthropic.claude-3-5-sonnet-20240620-v1:0",
        name: "anthropic.claude-3-5-sonnet-20240620-v1:0",
      },
      {
        id: "bedrock:anthropic.claude-3-haiku-20240307-v1:0",
        name: "anthropic.claude-3-haiku-20240307-v1:0",
      },
      {
        id: "bedrock:anthropic.claude-3-opus-20240229-v1:0",
        name: "anthropic.claude-3-opus-20240229-v1:0",
      },
      {
        id: "bedrock:anthropic.claude-3-5-sonnet-20241022-v1:0",
        name: "anthropic.claude-3-5-sonnet-20241022-v1:0",
      },
      {
        id: "bedrock:anthropic.claude-instant-v1",
        name: "anthropic.claude-instant-v1",
      },
    ],
  },
  {
    provider: "openai-azure",
    models: [
      {
        id: "openai-azure:gpt",
        name: "openai-azure:gpt",
      },
    ],
  },
];

export const PROVIDERS = providers.map((provider) => provider.provider);
export const LANGUAGE_MODELS = providers.flatMap((provider) => provider.models);
