import { Bell, BellOff } from "lucide-react";
import { useRouter } from "next/navigation";

import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { type MetricAlert } from "@/lib/actions/alerts/metric-rule";
import { cn } from "@/lib/utils";

import AlertRowMenu from "../alert-row/alert-row-menu";
import AlertTargets from "../alert-row/alert-targets";
import { CARD_CHART_HOURS } from "./constants";
import Sparkline from "./sparkline";
import StatusPill from "./status-pill";
import { alertStatus, conditionSummary, isSnoozed } from "./utils";

interface MetricAlertCardProps {
  alert: MetricAlert;
  isToggling: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: (alert: MetricAlert, disabled: boolean) => void;
}

export default function MetricAlertCard({ alert, isToggling, onEdit, onDelete, onToggle }: MetricAlertCardProps) {
  const router = useRouter();
  const muted = !!alert.rule.disabled;
  const summary = `${conditionSummary(alert.rule)}${isSnoozed(alert.rule) ? " · Snoozed" : ""}`;
  const open = () => router.push(`/project/${alert.projectId}/settings/alerts/${alert.id}`);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        // Keys from the portaled menu bubble here through the React tree.
        if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
        e.preventDefault();
        open();
      }}
      className="flex h-full cursor-pointer flex-col gap-2 rounded-md border bg-surface-up p-3 hover:overlay-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-center gap-2">
        <span className={cn("min-w-0 flex-1 truncate text-sm font-medium", muted && "opacity-60")} title={alert.name}>
          {alert.name}
        </span>
        <StatusPill status={alertStatus(alert)} />
        <AlertRowMenu onEdit={onEdit} onDelete={onDelete}>
          <DropdownMenuItem disabled={isToggling} onClick={() => onToggle(alert, !muted)} className="cursor-pointer">
            {muted ? <Bell className="size-3.5" /> : <BellOff className="size-3.5" />}
            {muted ? "Unmute" : "Mute"}
          </DropdownMenuItem>
        </AlertRowMenu>
      </div>
      {/* Two lines are always reserved, so cards in a row line up. */}
      <p className={cn("line-clamp-2 min-h-8 text-xs text-muted-foreground", muted && "opacity-60")} title={summary}>
        {summary}
      </p>
      <Sparkline alert={alert} className={cn(muted && "opacity-60")} />
      <div className={cn("mt-auto flex items-center justify-between gap-3", muted && "opacity-60")}>
        <AlertTargets targets={alert.targets} className="min-w-0" />
        <span className="shrink-0 text-xs text-muted-foreground">Last {CARD_CHART_HOURS}h</span>
      </div>
    </div>
  );
}
