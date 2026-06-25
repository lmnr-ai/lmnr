import { TooltipPortal } from "@radix-ui/react-tooltip";
import { TriangleAlert } from "lucide-react";
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
            <TooltipContent side="bottom" className="p-2 border flex flex-col gap-2 max-w-xs">
              <span className="text-xs text-secondary-foreground">No price configured for &quot;{model}&quot;.</span>
              <Button
                variant="warningOutline"
                size="sm"
                className="w-full"
                onClick={(e) => {
                  e.stopPropagation();
                  setDialogOpen(true);
                }}
              >
                Configure custom model costs
              </Button>
            </TooltipContent>
          </TooltipPortal>
        </Tooltip>
      </TooltipProvider>
      <ConfigureModelCostDialog
        model={model}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={() => {
          setSaved(true);
          onSaved?.();
        }}
      />
    </>
  );
}
