import {
  IconAmazonBedrock,
  IconAnthropic,
  IconAzure,
  IconGemini,
  IconGroq,
  IconMistral,
  IconOpenAI,
} from "@/components/ui/icons";
import { type LlmProfileProvider, type LlmProviderFamily, providerFamily } from "@/lib/actions/llm-profiles/schema";
import { cn } from "@/lib/utils";

const FAMILY_ICONS: Record<LlmProviderFamily, typeof IconOpenAI> = {
  openai: IconOpenAI,
  anthropic: IconAnthropic,
  gemini: IconGemini,
  groq: IconGroq,
  mistral: IconMistral,
  bedrock: IconAmazonBedrock,
  azure: IconAzure,
};

function iconFamily(provider: LlmProfileProvider | LlmProviderFamily): LlmProviderFamily {
  return provider in FAMILY_ICONS ? (provider as LlmProviderFamily) : providerFamily(provider as LlmProfileProvider);
}

export function ProviderIcon({
  provider,
  className,
}: {
  provider: LlmProfileProvider | LlmProviderFamily;
  className?: string;
}) {
  const Icon = FAMILY_ICONS[iconFamily(provider)];
  return <Icon className={cn("size-4 shrink-0", className)} />;
}
