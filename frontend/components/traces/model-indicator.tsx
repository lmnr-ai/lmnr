import { get } from "lodash";

import { Label } from "../ui/label";

interface ModelIndicatorProps {
  attributes: Record<string, any>;
}

export const ModelIndicator = ({ attributes }: ModelIndicatorProps) => {
  const model = get(attributes, "gen_ai.response.model") || get(attributes, "gen_ai.request.model") || "";

  if (!model) return null;

  return (
    <Label className="h-6 w-fit flex items-center text-xs truncate border rounded-md px-2 border-llm-foreground/50 shadow-[inset_0_0_12px_0] shadow-llm-foreground/10 bg-llm-foreground/10 text-llm-foreground">
      {model}
    </Label>
  );
};
