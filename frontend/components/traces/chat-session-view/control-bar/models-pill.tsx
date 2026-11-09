import { TooltipPortal } from "@radix-ui/react-tooltip";
import { MessageCircle } from "lucide-react";

import { MetricBreakdownRow } from "@/components/traces/cells/metric-breakdown-row";
import { MODEL_PILL_CLS } from "@/components/traces/model-indicator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface ModelShare {
  model: string;
  tokens: number;
}

/** Session model(s); several collapse into "N models" with a token-share breakdown tooltip. */
export default function ModelsPill({ models }: { models: ModelShare[] }) {
  if (models.length === 0) return null;

  const label = (text: string) => (
    <>
      <MessageCircle size={12} className="min-w-3" />
      <span className="truncate">{text}</span>
    </>
  );

  if (models.length === 1) return <span className={MODEL_PILL_CLS}>{label(models[0].model)}</span>;

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
