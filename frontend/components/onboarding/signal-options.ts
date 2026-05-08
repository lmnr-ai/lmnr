import { type SignalOption } from "@/components/onboarding/types";
import signalTemplates from "@/components/signals/prompts";

export const SIGNAL_OPTIONS: SignalOption[] = signalTemplates.map((t) => ({
  id: t.name,
  name: t.name,
  shortName: t.shortName,
  description: t.description,
  prompt: t.prompt,
  structuredOutputSchema: t.structuredOutputSchema,
}));
