import { Radio } from "lucide-react";

import SeverityIcon from "@/components/traces/trace-view/signal-events-panel/severity-icon";
import { type AlertWithDetails } from "@/lib/actions/alerts/types";
import { cn } from "@/lib/utils";

import AlertRowMenu from "./alert-row-menu";
import AlertSwitch from "./alert-switch";
import AlertTargets from "./alert-targets";
import { alertSeverities, isAlertDisabled } from "./utils";

interface AlertRowProps {
  alert: AlertWithDetails;
  userEmail: string;
  hideSignal?: boolean;
  isToggling: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: (alert: AlertWithDetails, disabled: boolean) => void;
}

export default function AlertRow({
  alert,
  userEmail,
  hideSignal,
  isToggling,
  onEdit,
  onDelete,
  onToggle,
}: AlertRowProps) {
  const off = isAlertDisabled(alert);
  const targets = alert.targets.filter((t) => t.type !== "EMAIL" || t.email === userEmail);
  const severities = alertSeverities(alert);
  const signal = hideSignal ? null : alert.signalName;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onEdit}
      onKeyDown={(e) => {
        // Keys from the switch or the portaled menu bubble here through the React tree.
        if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
        e.preventDefault();
        onEdit();
      }}
      className="flex min-h-14 cursor-pointer items-center gap-3 px-4 py-2.5 hover:overlay-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className={cn("flex min-w-0 flex-1 flex-col gap-0.5", off && "opacity-60")}>
        <span className="truncate text-sm" title={alert.name}>
          {alert.name}
        </span>
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          {signal && (
            <span className="flex min-w-0 items-center gap-1">
              <Radio className="size-3.5 shrink-0" />
              <span className="truncate">{signal}</span>
            </span>
          )}
          {signal && severities.length > 0 && <span aria-hidden>·</span>}
          {severities.map((s) => (
            <SeverityIcon key={s} severity={s} iconClassName="size-3.5" />
          ))}
          {/* Keeps every row two lines on a signal's page, where the signal name is hidden. */}
          {!signal && severities.length === 0 && <span>Every new cluster</span>}
        </span>
      </div>
      <AlertTargets
        targets={targets}
        className={cn("hidden max-w-[40%] shrink-0 justify-end sm:flex", off && "opacity-60")}
      />
      <div className="flex shrink-0 items-center gap-1">
        <AlertSwitch alert={alert} disabled={isToggling} onToggle={onToggle} />
        <AlertRowMenu onEdit={onEdit} onDelete={onDelete} />
      </div>
    </div>
  );
}
