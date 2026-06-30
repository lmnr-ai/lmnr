import { Mail, Slack } from "lucide-react";
import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface TargetChipItem {
  id: string;
  type: string;
  channelId?: string | null;
  channelName?: string | null;
  email?: string | null;
}

function TargetIcon({ type }: { type: string }) {
  if (type === "SLACK") {
    return <Slack className="size-3 shrink-0 text-muted-foreground" />;
  }
  if (type === "EMAIL") {
    return <Mail className="size-3 shrink-0 text-muted-foreground" />;
  }
  return null;
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

export default function TargetChips({ targets, compact = false }: { targets: TargetChipItem[]; compact?: boolean }) {
  const grouped = useMemo(() => groupTargetsByType(targets), [targets]);

  if (targets.length === 0) {
    return <span className="text-xs leading-5 text-muted-foreground italic">Not configured</span>;
  }

  return (
    <div className={cn("flex flex-wrap gap-1.5", !compact && "py-1.5")}>
      {Array.from(grouped.entries()).map(([type, items]) =>
        items.map((target) => (
          <Badge key={target.id} variant="outline" className="gap-1.5 font-normal text-xs max-w-full">
            <TargetIcon type={type} />
            <span className="truncate">{getTargetLabel(target)}</span>
          </Badge>
        ))
      )}
    </div>
  );
}
