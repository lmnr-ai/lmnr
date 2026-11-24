import { Plus } from "lucide-react";
import { type ReactNode, useState } from "react";

import { Button } from "@/components/ui/button";
import { type AlertType, type AlertWithDetails } from "@/lib/actions/alerts/types";

import { COLLAPSED_ROWS, SECTION_META } from "./constants";
import SectionIcon from "./section-icon";

interface AlertSectionProps {
  type: AlertType;
  alerts: AlertWithDetails[];
  onCreate: (type: AlertType) => void;
  renderRow: (alert: AlertWithDetails) => ReactNode;
}

export default function AlertSection({ type, alerts, onCreate, renderRow }: AlertSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const meta = SECTION_META[type];
  const overflow = Math.max(0, alerts.length - COLLAPSED_ROWS);
  const shown = expanded ? alerts : alerts.slice(0, COLLAPSED_ROWS);

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2 px-1">
        <SectionIcon type={type} />
        <h2 className="text-sm font-medium">{meta.title}</h2>
        {alerts.length > 0 && <span className="text-xs text-muted-foreground">{alerts.length}</span>}
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto gap-1 text-muted-foreground"
          onClick={() => onCreate(type)}
        >
          <Plus className="size-3.5" />
          Add
        </Button>
      </div>
      {alerts.length === 0 ? (
        <button
          type="button"
          onClick={() => onCreate(type)}
          className="flex flex-col items-center gap-1 rounded-md border border-dashed px-4 py-6 text-center transition-colors hover:overlay-hover"
        >
          <span className="text-sm text-muted-foreground">{meta.empty}</span>
          <span className="flex items-center gap-1 text-xs text-foreground">
            <Plus className="size-3.5" />
            Create {type === "NEW_CLUSTER" ? "a cluster" : "an event"} alert
          </span>
        </button>
      ) : (
        <div className="divide-y rounded-md border bg-surface-up">
          {shown.map(renderRow)}
          {overflow > 0 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="w-full px-4 py-2 text-left text-xs text-muted-foreground hover:overlay-hover hover:text-foreground"
            >
              {expanded ? "Show less" : `Show ${overflow} more`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
