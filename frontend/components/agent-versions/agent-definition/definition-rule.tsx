import { Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface DefinitionRuleProps {
  substrings: string[];
  onRemove: () => void;
  /** Set for the last rule, with the reason shown on hover. */
  disabledReason?: string;
  isRemoving?: boolean;
}

export default function DefinitionRule({ substrings, onRemove, disabledReason, isRemoving }: DefinitionRuleProps) {
  const button = (
    <Button
      variant="ghost"
      size="icon-sm"
      className="shrink-0 text-muted-foreground"
      disabled={!!disabledReason || isRemoving}
      onClick={onRemove}
      aria-label="Remove rule"
    >
      {isRemoving ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
    </Button>
  );

  return (
    <li className="flex items-center gap-2 py-1.5 pl-3 pr-1.5">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
        <span className="text-xs text-muted-foreground">Contains:</span>
        {substrings.map((substring, i) => (
          <span key={i} className="inline-flex min-w-0 max-w-full items-center text-xs text-muted-foreground">
            <code className="min-w-0 rounded border bg-background px-1.5 py-0.5 font-mono text-xs whitespace-pre-wrap break-words text-secondary-foreground">
              {substring}
            </code>
            {i < substrings.length - 1 && ","}
          </span>
        ))}
      </div>
      {disabledReason ? (
        <Tooltip>
          {/* A disabled button gets no pointer events, so the wrapper triggers the tooltip. */}
          <TooltipTrigger asChild>
            <span tabIndex={0} className="shrink-0">
              {button}
            </span>
          </TooltipTrigger>
          <TooltipContent>{disabledReason}</TooltipContent>
        </Tooltip>
      ) : (
        button
      )}
    </li>
  );
}
