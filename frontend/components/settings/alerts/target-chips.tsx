import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { type AlertTarget } from "@/lib/actions/alerts/types";

function groupTargetsByType(targets: AlertTarget[]): Map<string, AlertTarget[]> {
  const grouped = new Map<string, AlertTarget[]>();
  for (const target of targets) {
    const list = grouped.get(target.type) ?? [];
    list.push(target);
    grouped.set(target.type, list);
  }
  return grouped;
}

function getTargetLabel(target: AlertTarget): string {
  if (target.type === "slack") {
    return target.channelName ? `#${target.channelName}` : (target.channelId ?? "unknown");
  }
  if (target.type === "email") {
    return target.email ?? "unknown";
  }
  return target.channelId ?? target.type;
}

export default function TargetChips({ targets }: { targets: AlertTarget[] }) {
  const grouped = useMemo(() => groupTargetsByType(targets), [targets]);

  if (targets.length === 0) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {Array.from(grouped.entries()).map(([type, items]) =>
        items.map((target) => (
          <Badge key={target.id} variant="outline" className="font-normal text-xs whitespace-nowrap">
            <span className="text-muted-foreground capitalize mr-1">{type}</span>
            {getTargetLabel(target)}
          </Badge>
        ))
      )}
    </div>
  );
}
