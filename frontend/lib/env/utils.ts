import { GenericNode, LLMNode, MapNode, NodeType, SubpipelineNode } from "@/lib/flow/types";

export enum EnvVars {
  OPENAI_API_KEY = "OPENAI_API_KEY",
  GEMINI_API_KEY = "GEMINI_API_KEY",
  GROQ_API_KEY = "GROQ_API_KEY",
  ANTHROPIC_API_KEY = "ANTHROPIC_API_KEY",
  MISTRAL_API_KEY = "MISTRAL_API_KEY",
  ZENGUARD_API_KEY = "ZENGUARD_API_KEY",
  OPENAI_AZURE_API_KEY = "AZURE_API_KEY",
  OPENAI_AZUURE_DEPLOYMENT_NAME = "OPENAI_AZURE_DEPLOYMENT_NAME",
  OPENAI_AZUURE_RESOURCE_ID = "OPENAI_AZURE_RESOURCE_ID",
  AWS_REGION = "AWS_REGION",
  AWS_ACCESS_KEY_ID = "AWS_ACCESS_KEY_ID",
  AWS_SECRET_ACCESS_KEY = "AWS_SECRET_ACCESS_KEY",
  GOOGLE_SEARCH_ENGINE_ID = "GOOGLE_SEARCH_ENGINE_ID",
  GOOGLE_SEARCH_API_KEY = "GOOGLE_SEARCH_API_KEY",
}

export enum LLMModelProviders {
  OPENAI = 'openai',
  GEMINI = 'gemini',
  GROQ = 'groq',
  ANTHROPIC = 'anthropic',
  MISTRAL = 'mistral',
  OPENAI_AZURE = 'openai-azure',
  BEDROCK = 'bedrock',
}

// Maps the provider, which we use in the format `provider:model`, to the corresponding API key environment variable
export const MODEL_PROVIDER_TO_API_KEYS: Record<string, string[]> = {
  [LLMModelProviders.OPENAI]: [EnvVars.OPENAI_API_KEY],
  [LLMModelProviders.GEMINI]: [EnvVars.GEMINI_API_KEY],
  [LLMModelProviders.GROQ]: [EnvVars.GROQ_API_KEY],
  [LLMModelProviders.ANTHROPIC]: [EnvVars.ANTHROPIC_API_KEY],
  [LLMModelProviders.MISTRAL]: [EnvVars.MISTRAL_API_KEY],
  [LLMModelProviders.OPENAI_AZURE]: [EnvVars.OPENAI_AZURE_API_KEY, EnvVars.OPENAI_AZUURE_DEPLOYMENT_NAME, EnvVars.OPENAI_AZUURE_RESOURCE_ID],
  [LLMModelProviders.BEDROCK]: [EnvVars.AWS_REGION, EnvVars.AWS_ACCESS_KEY_ID, EnvVars.AWS_SECRET_ACCESS_KEY],

};

export function getRequiredEnvVars(nodes: GenericNode[]): Set<string> {
  let vars = new Set<string>();

  for (const node of nodes) {

    if ([NodeType.LLM].includes(node.type)) {
      const model = (node as LLMNode).model;
      if (!model) {
        continue;
      }
      const modelProvider: string = model.split(':')[0];
      MODEL_PROVIDER_TO_API_KEYS[modelProvider].forEach(envVar => vars.add(envVar));
    } else if (node.type === NodeType.ZENGUARD) {
      vars.add('ZENGUARD_API_KEY')
    } else if (node.type == NodeType.WEB_SEARCH) {
      vars.add("GOOGLE_SEARCH_ENGINE_ID")
      vars.add("GOOGLE_SEARCH_API_KEY")
    } else if (node.type == NodeType.SUBPIPELINE) {
      const envVars = getRequiredEnvVars(Array.from(Object.values((node as SubpipelineNode).runnableGraph.nodes)));
      for (const envVar of envVars) {
        vars.add(envVar)
      }
    } else if (node.type == NodeType.MAP) {
      const envVars = getRequiredEnvVars(Array.from(Object.values((node as MapNode).runnableGraph.nodes)));
      for (const envVar of envVars) {
        vars.add(envVar)
      }
    }
  }
  return vars;
}

export const ENV_VAR_TO_ISSUER_URL: Record<string, string> = {
  [EnvVars.OPENAI_API_KEY]: "https://platform.openai.com/api-keys",
  [EnvVars.GROQ_API_KEY]: "https://console.groq.com/keys",
  [EnvVars.ANTHROPIC_API_KEY]: "https://console.anthropic.com/settings/keys",
  [EnvVars.MISTRAL_API_KEY]: "https://console.mistral.ai/api-keys/",
  [EnvVars.ZENGUARD_API_KEY]: "https://console.zenguard.ai/settings",
  [EnvVars.GOOGLE_SEARCH_ENGINE_ID]: "https://developers.google.com/custom-search/v1/overview",
  [EnvVars.GOOGLE_SEARCH_API_KEY]: "https://developers.google.com/custom-search/v1/overview",
}
