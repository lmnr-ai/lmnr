import { get } from "lodash";
import { MessageCircle } from "lucide-react";

interface ModelIndicatorProps {
  attributes: Record<string, any>;
}

export const ModelIndicator = ({ attributes }: ModelIndicatorProps) => {
  const model = get(attributes, "gen_ai.response.model") || get(attributes, "gen_ai.request.model") || "";

  if (!model) return null;

  return (
    <span className="h-6 w-fit flex items-center gap-1 rounded-md px-2 text-xs font-mono bg-llm-foreground/15 text-llm-foreground">
      <MessageCircle size={12} className="min-w-3" />
      {model}
    </span>
  );
};
