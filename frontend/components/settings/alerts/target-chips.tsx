import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";

export interface TargetChipItem {
  id: string;
  type: string;
  channelId?: string | null;
  channelName?: string | null;
  email?: string | null;
}

function groupTargetsByType(targets: TargetChipItem[]): Map<string, TargetChipItem[]> {
  const grouped = new Map<string, TargetChipItem[]>();
  for (const target of targets) {
    const list = grouped.get(target.type) ?? [];
    list.push(target);
    grouped.set(target.type, list);
  }
  return grouped;
}

function getTargetLabel(target: TargetChipItem): string {
  if (target.type === "SLACK") {
    return target.channelName ? `#${target.channelName}` : (target.channelId ?? "unknown");
  }
  if (target.type === "EMAIL") {
    return target.email ?? "unknown";
  }
  return target.channelId ?? target.type;
}

export default function TargetChips({ targets }: { targets: TargetChipItem[] }) {
  const grouped = useMemo(() => groupTargetsByType(targets), [targets]);

  if (targets.length === 0) {
    return <span className="text-xs text-muted-foreground italic">No channel configured</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {Array.from(grouped.entries()).map(([type, items]) =>
        items.map((target) => (
          <Badge key={target.id} variant="outline" className="font-normal text-xs whitespace-nowrap">
            <span className="text-muted-foreground capitalize mr-1">{type.toLowerCase()}</span>
            {getTargetLabel(target)}
          </Badge>
        ))
      )}
    </div>
  );
}
