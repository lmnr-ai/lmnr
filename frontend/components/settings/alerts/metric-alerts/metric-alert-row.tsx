import { useRouter } from "next/navigation";

import { Switch } from "@/components/ui/switch";
import { type MetricAlert } from "@/lib/actions/alerts/metric-rule";
import { cn } from "@/lib/utils";

import AlertRowMenu from "../alert-row/alert-row-menu";
import AlertTargets from "../alert-row/alert-targets";
import Sparkline from "./sparkline";
import StatusPill from "./status-pill";
import { alertStatus, conditionSummary, isSnoozed } from "./utils";

interface MetricAlertRowProps {
  alert: MetricAlert;
  isToggling: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: (alert: MetricAlert, disabled: boolean) => void;
}

export default function MetricAlertRow({ alert, isToggling, onEdit, onDelete, onToggle }: MetricAlertRowProps) {
  const router = useRouter();
  const muted = !!alert.rule.disabled;
  const open = () => router.push(`/project/${alert.projectId}/settings/alerts/${alert.id}`);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        // Keys from the switch or the portaled menu bubble here through the React tree.
        if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
        e.preventDefault();
        open();
      }}
      className="flex min-h-14 cursor-pointer items-center gap-3 px-4 py-2.5 hover:overlay-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className={cn("flex min-w-0 flex-1 flex-col gap-0.5", muted && "opacity-60")}>
        <span className="truncate text-sm" title={alert.name}>
          {alert.name}
        </span>
        <span className="truncate text-xs text-muted-foreground" title={conditionSummary(alert.rule)}>
          {conditionSummary(alert.rule)}
          {isSnoozed(alert.rule) && " · Snoozed"}
        </span>
      </div>
      <AlertTargets
        targets={alert.targets}
        className={cn("hidden max-w-[25%] shrink-0 justify-end lg:flex", muted && "opacity-60")}
      />
      <Sparkline alert={alert} className={cn("hidden shrink-0 sm:block", muted && "opacity-60")} />
      <StatusPill status={alertStatus(alert)} className="min-w-16 justify-center" />
      <div className="flex shrink-0 items-center gap-1">
        <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} className="flex items-center">
          <Switch
            checked={!muted}
            disabled={isToggling}
            onCheckedChange={(checked) => onToggle(alert, !checked)}
            aria-label={muted ? "Unmute alert" : "Mute alert"}
          />
        </div>
        <AlertRowMenu onEdit={onEdit} onDelete={onDelete} />
      </div>
    </div>
  );
}
