import { get } from "lodash";

import { Label } from "../ui/label";

interface ModelIndicatorProps {
  attributes: Record<string, any>;
}

export const ModelIndicator = ({ attributes }: ModelIndicatorProps) => {
  const model = get(attributes, "gen_ai.response.model") || get(attributes, "gen_ai.request.model") || "";

  if (!model) return null;

  return (
    <Label className="h-6 w-fit flex items-center text-xs truncate font-mono border rounded-md px-2 border-llm-foreground bg-llm-foreground/10 text-llm-foreground">
      {model}
    </Label>
  );
};
