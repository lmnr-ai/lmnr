import { TooltipPortal } from "@radix-ui/react-tooltip";
import { TriangleAlert } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";

import { ConfigureModelCostDialog } from "@/components/settings/custom-model-costs";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface UnpricedModelWarningProps {
  model: string;
  size?: number;
  className?: string;
  /** Refresh cost data after the user saves a price. */
  onSaved?: () => void;
}

/**
 * Shown in place of a "$0.00" cost when a span's model has no associated price.
 * Hovering reveals a button that opens the custom-model-cost dialog prefilled
 * with the unknown model name. The dialog is rendered as a controlled sibling of
 * the tooltip so it survives the tooltip closing on click.
 */
export function UnpricedModelWarning({ model, size = 12, className, onSaved }: UnpricedModelWarningProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  // Tree/transcript rows are virtualized with index-based keys, so React reuses
  // this instance for different spans on scroll. Reset the in-session `saved`
  // flag when the model changes so a prior save doesn't suppress the warning
  // for a different unpriced model.
  const [prevModel, setPrevModel] = useState(model);
  if (model !== prevModel) {
    setPrevModel(model);
    setSaved(false);
  }
  // Configuring costs requires a project context + membership. On public shared
  // trace pages the route only carries `traceId`, so offer the info-only warning.
  const { projectId } = useParams();
  const canConfigure = !!projectId;

  // Stored span costs aren't recomputed retroactively, so hide the warning
  // in-session once the user configures a price to confirm their action landed.
  if (saved) return null;

  return (
    <>
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={cn("inline-flex items-center text-amber-600 dark:text-amber-500 cursor-default", className)}
              onClick={(e) => e.stopPropagation()}
            >
              <TriangleAlert size={size} className="min-w-3" />
            </span>
          </TooltipTrigger>
          <TooltipPortal>
            <TooltipContent side="bottom" className="p-2 border flex flex-col gap-2 max-w-[224px]">
              <span className="text-xs text-secondary-foreground">No price configured for &quot;{model}&quot;.</span>
              {canConfigure && (
                <Button
                  variant="outline"
                  className="h-6 text-xs px-1.5 bg-transparent"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDialogOpen(true);
                  }}
                >
                  Configure custom model costs
                </Button>
              )}
            </TooltipContent>
          </TooltipPortal>
        </Tooltip>
      </TooltipProvider>
      {canConfigure && (
        <ConfigureModelCostDialog
          model={model}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onSaved={() => {
            setSaved(true);
            onSaved?.();
          }}
        />
      )}
    </>
  );
}
