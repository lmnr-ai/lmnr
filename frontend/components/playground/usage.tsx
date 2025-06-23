import React, { memo } from "react";

import { PlaygroundOutputStore } from "./playground-output";

const tokenLabels: Record<keyof PlaygroundOutputStore["usage"], string> = {
  promptTokens: "Prompt Tokens",
  completionTokens: "Completion Tokens",
  totalTokens: "Total Tokens",
};

const Usage = ({ usage }: Pick<PlaygroundOutputStore, "usage">) => {
  const validTokens = (Object.entries(tokenLabels) as [keyof PlaygroundOutputStore["usage"], string][]).filter(
    ([key]) => !isNaN(usage?.[key])
  );

  if (validTokens.length > 0) {
    return (
      <div className="flex flex-wrap items-center gap-1 mt-2">
        {validTokens.map(([key, label]) => (
          <span key={key} className="text-xs text-secondary-foreground">
            &#8226; {label}: <b>{usage[key]}</b>
          </span>
        ))}
      </div>
    );
  }
};

export default memo(Usage);
