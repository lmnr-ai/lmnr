import { EnvVars } from "@/lib/env/utils";


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
