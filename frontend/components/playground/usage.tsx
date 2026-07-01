import React, { memo } from "react";

import { type PlaygroundOutputStore } from "./playground-output";

const Usage = ({ usage }: Pick<PlaygroundOutputStore, "usage">) => {
  const tokens: [string, number | undefined][] = [
    ["Input Tokens", usage?.inputTokens],
    ["Output Tokens", usage?.outputTokens],
    ["Cached Input Tokens", usage?.inputTokenDetails?.cacheReadTokens],
    ["Reasoning Tokens", usage?.outputTokenDetails?.reasoningTokens],
    ["Total Tokens", usage?.totalTokens],
  ];

  const validTokens = tokens.filter((entry): entry is [string, number] => !!entry[1] && !isNaN(entry[1]));

  if (validTokens.length > 0) {
    return (
      <div className="flex flex-wrap items-center gap-1 mt-2">
        {validTokens.map(([label, value]) => (
          <span key={label} className="text-xs text-secondary-foreground">
            &#8226; {label}: <b>{value}</b>
          </span>
        ))}
      </div>
    );
  }
};

export default memo(Usage);
