import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipPortal, TooltipTrigger } from "@/components/ui/tooltip";
import { type AlertWithDetails } from "@/lib/actions/alerts/types";

import { isAlertDisabled } from "./utils";

export default function AlertSwitch({
  alert,
  disabled,
  onToggle,
}: {
  alert: AlertWithDetails;
  disabled: boolean;
  onToggle: (alert: AlertWithDetails, disabled: boolean) => void;
}) {
  const isDisabled = isAlertDisabled(alert);
  const label = isDisabled ? "Enable alert" : "Disable alert";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} className="flex items-center">
          <Switch
            checked={!isDisabled}
            disabled={disabled}
            onCheckedChange={(checked) => onToggle(alert, !checked)}
            aria-label={label}
          />
        </div>
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent>{label}</TooltipContent>
      </TooltipPortal>
    </Tooltip>
  );
}
