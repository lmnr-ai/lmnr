import { TooltipPortal } from "@radix-ui/react-tooltip";
import { MessageCircle } from "lucide-react";

import { MetricBreakdownRow } from "@/components/traces/cells/metric-breakdown-row";
import { MODEL_PILL_CLS } from "@/components/traces/model-indicator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { type ModelTokens } from "@/lib/actions/sessions/model-tokens";

// From this many models the pills collapse into one "N models" pill with a token-share tooltip.
const COLLAPSE_AT = 4;

const label = (text: string) => (
  <>
    <MessageCircle size={12} className="min-w-3" />
    <span className="truncate">{text}</span>
  </>
);

/** One pill per model the session used, most tokens first; many collapse into "N models". */
export default function ModelPills({ models }: { models: ModelTokens[] }) {
  if (models.length < COLLAPSE_AT) {
    return models.map(({ model }) => (
      <span key={model} className={MODEL_PILL_CLS}>
        {label(model)}
      </span>
    ));
  }

  const total = models.reduce((sum, m) => sum + m.tokens, 0);

  // Same shape as the token breakdown tooltip in StatsShields.
  return (
    <TooltipProvider delayDuration={250}>
      <Tooltip>
        <TooltipTrigger className={MODEL_PILL_CLS}>{label(`${models.length} models`)}</TooltipTrigger>
        <TooltipPortal>
          <TooltipContent side="bottom" className="flex flex-col gap-1 min-w-55 p-2">
            {models.map((m) => (
              <MetricBreakdownRow
                key={m.model}
                label={m.model}
                value={total > 0 ? `${Math.round((m.tokens / total) * 100)}%` : "–"}
              />
            ))}
          </TooltipContent>
        </TooltipPortal>
      </Tooltip>
    </TooltipProvider>
  );
}
