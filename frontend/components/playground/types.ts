import { EnvVars } from "@/lib/env/utils";

export type LanguageModel = {
  id: `${Provider}:${string}`;
  name: string;
  label: string;
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
        label: "GPT-4o mini",
      },
      {
        id: "openai:gpt-4-turbo",
        name: "gpt-4-turbo",
        label: "GPT-4 Turbo",
      },
      {
        id: "openai:gpt-4o",
        name: "gpt-4o",
        label: "GPT-4o",
      },
      {
        id: "openai:o1-mini",
        name: "o1-mini",
        label: "o1-mini",
      },
      {
        id: "openai:o1-preview",
        name: "o1-preview",
        label: "o1-preview",
      },
      {
        id: "openai:o1",
        name: "o1",
        label: "o1",
      },
      {
        id: "openai:o3-mini",
        name: "o3-mini",
        label: "o3-mini",
      },
      {
        id: "openai:o4-mini",
        name: "o4-mini",
        label: "o4-mini",
      },
      {
        id: "openai:gpt-4.1",
        name: "gpt-4.1",
        label: "GPT-4.1",
      },
      {
        id: "openai:gpt-4.1-mini",
        name: "gpt-4.1-mini",
        label: "GPT-4.1 Mini",
      },
    ],
  },
  {
    provider: "anthropic",
    models: [
      {
        id: "anthropic:claude-3-haiku-20240307",
        name: "claude-3-haiku-20240307",
        label: "Claude 3 Haiku",
      },
      {
        id: "anthropic:claude-3-sonnet-20240229",
        name: "claude-3-sonnet-20240229",
        label: "Claude 3 Sonnet",
      },
      {
        id: "anthropic:claude-3-opus-20240229",
        name: "claude-3-opus-20240229",
        label: "Claude 3 Opus",
      },
      {
        id: "anthropic:claude-3-5-sonnet-20241022",
        name: "claude-3-5-sonnet-20241022",
        label: "Claude 3.5 Sonnet",
      },
      {
        id: "anthropic:claude-3-5-haiku-20241022",
        name: "claude-3-5-haiku-20241022",
        label: "Claude 3.5 Haiku",
      },
      {
        id: "anthropic:claude-3-7-sonnet-20250219",
        name: "claude-3-7-sonnet-20250219",
        label: "Claude 3.7 Sonnet",
      },
      {
        id: "anthropic:claude-3-7-sonnet-20250219:thinking",
        name: "claude-3-7-sonnet-20250219",
        label: "Claude 3.7 Sonnet (Thinking)",
      },
    ],
  },
  {
    provider: "gemini",
    models: [
      {
        id: "gemini:gemini-1.5-flash",
        name: "1.5-flash",
        label: "Gemini 1.5 Flash",
      },
      {
        id: "gemini:gemini-1.5-pro",
        name: "1.5-pro",
        label: "Gemini 1.5 Pro",
      },
      {
        id: "gemini:gemini-2.5-flash-preview-04-17",
        name: "gemini-2.5-flash-preview-04-17",
        label: "Gemini 2.5 Flash Preview",
      },
      {
        id: "gemini:gemini-2.5-pro-exp-03-25",
        name: "gemini-2.5-pro-exp-03-25",
        label: "Gemini 2.5 Pro Experimental",
      },
      {
        id: "gemini:gemini-2.5-pro-preview-05-06",
        name: "gemini-2.5-pro-preview-05-06",
        label: "Gemini 2.5 Pro Preview",
      },
    ],
  },
  {
    provider: "groq",
    models: [
      {
        id: "groq:llama-3.1-405b-reasoning",
        name: "llama-3.1-405b-reasoning",
        label: "Llama 3.1 405B Reasoning",
      },
      {
        id: "groq:llama-3.1-70b-versatile",
        name: "llama-3.1-70b-versatile",
        label: "Llama 3.1 70B Versatile",
      },
      {
        id: "groq:llama-3.1-8b-instant",
        name: "llama-3.1-8b-instant",
        label: "Llama 3.1 8B Instant",
      },
      {
        id: "groq:llama3-groq-8b-8192-tool-use-preview",
        name: "llama3-groq-8b-8192-tool-use-preview",
        label: "Llama 3 8B Tool Use Preview",
      },
      {
        id: "groq:llama3-8b-8192",
        name: "llama3-8b-8192",
        label: "Llama 3 8B",
      },
      {
        id: "groq:llama3-70b-8192",
        name: "llama3-70b-8192",
        label: "Llama 3 70B",
      },
      {
        id: "groq:mixtral-8x7b-32768",
        name: "mixtral-8x7b-32768",
        label: "Mixtral 8x7B",
      },
      {
        id: "groq:gemma2-9b-it",
        name: "gemma2-9b-it",
        label: "Gemma 2 9B IT",
      },
      {
        id: "groq:gemma-7b-it",
        name: "gemma-7b-it",
        label: "Gemma 7B IT",
      },
    ],
  },
  {
    provider: "mistral",
    models: [
      {
        id: "mistral:mistral-small",
        name: "mistral-small",
        label: "Mistral Small",
      },
      {
        id: "mistral:mistral-tiny",
        name: "mistral-tiny",
        label: "Mistral Tiny",
      },
    ],
  },
  {
    provider: "bedrock",
    models: [
      {
        id: "bedrock:anthropic.claude-v2",
        name: "anthropic.claude-v2",
        label: "Claude V2",
      },
      {
        id: "bedrock:anthropic.claude-v2:1",
        name: "anthropic.claude-v2:1",
        label: "Claude V2.1",
      },
      {
        id: "bedrock:anthropic.claude-3-sonnet-20240229-v1:0",
        name: "anthropic.claude-3-sonnet-20240229-v1:0",
        label: "Claude 3 Sonnet",
      },
      {
        id: "bedrock:anthropic.claude-3-5-sonnet-20240620-v1:0",
        name: "anthropic.claude-3-5-sonnet-20240620-v1:0",
        label: "Claude 3.5 Sonnet",
      },
      {
        id: "bedrock:anthropic.claude-3-haiku-20240307-v1:0",
        name: "anthropic.claude-3-haiku-20240307-v1:0",
        label: "Claude 3 Haiku",
      },
      {
        id: "bedrock:anthropic.claude-3-opus-20240229-v1:0",
        name: "anthropic.claude-3-opus-20240229-v1:0",
        label: "Claude 3 Opus",
      },
      {
        id: "bedrock:anthropic.claude-3-5-sonnet-20241022-v1:0",
        name: "anthropic.claude-3-5-sonnet-20241022-v1:0",
        label: "Claude 3.5 Sonnet",
      },
      {
        id: "bedrock:anthropic.claude-instant-v1",
        name: "anthropic.claude-instant-v1",
        label: "Claude Instant",
      },
    ],
  },
  {
    provider: "openai-azure",
    models: [
      {
        id: "openai-azure:gpt",
        name: "openai-azure:gpt",
        label: "Azure OpenAI GPT",
      },
    ],
  },
];
