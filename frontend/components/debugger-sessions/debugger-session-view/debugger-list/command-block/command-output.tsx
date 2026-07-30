"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

// Rendered-length cap: a multi-MB output as one DOM text node stalls layout
// even when max-h clips it visually. The rest renders on explicit request.
const OUTPUT_CHAR_BUDGET = 20_000;

interface CommandOutputProps {
  output?: string;
  failed?: boolean;
}

/**
 * A command's stdout/result text. Renders up to OUTPUT_CHAR_BUDGET chars with a
 * "Show full output" affordance for the remainder (nothing is silently
 * truncated). The box caps at max-h-80 with internal scroll; `pre-wrap` +
 * `break-words` keep one long line from creating a huge scroll width.
 */
export default function CommandOutput({ output, failed }: CommandOutputProps) {
  const [showFull, setShowFull] = useState(false);

  if (output === undefined || output.length === 0) {
    return <div className="px-3 py-2 text-xs text-muted-foreground">No output</div>;
  }

  const overBudget = output.length > OUTPUT_CHAR_BUDGET;
  const visible = showFull || !overBudget ? output : output.slice(0, OUTPUT_CHAR_BUDGET);

  return (
    <div className="flex flex-col">
      {/* Only the text scrolls; the "show full" control lives OUTSIDE the
          scroller so it stays visible for an over-budget payload (whose
          truncated text is far taller than max-h-80) instead of being buried
          at the bottom of the inner scroll. */}
      <div className="max-h-80 overflow-auto">
        <pre
          className={cn(
            "whitespace-pre-wrap break-words px-3 py-2 font-mono text-xs leading-5",
            failed ? "text-destructive" : "text-secondary-foreground"
          )}
        >
          {visible}
        </pre>
      </div>
      {overBudget && !showFull && (
        <button
          type="button"
          onClick={() => setShowFull(true)}
          className="self-start px-3 py-2 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          Show full output ({output.length.toLocaleString()} chars)
        </button>
      )}
    </div>
  );
}
