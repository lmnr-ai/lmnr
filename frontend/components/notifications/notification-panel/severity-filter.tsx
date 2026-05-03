"use client";

import { SeverityIcon } from "@/components/notifications/notification-panel/severity-icon";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type SeverityFilterValue = "all" | "critical" | "warning" | "info";

export interface SeverityFilterCounts {
  all: number;
  critical: number;
  warning: number;
  info: number;
}

export const SeverityFilter = ({
  value,
  onChange,
  counts,
}: {
  value: SeverityFilterValue;
  onChange: (next: SeverityFilterValue) => void;
  counts: SeverityFilterCounts;
}) => (
  <div className="px-3 pb-2 shrink-0">
    <Tabs value={value} onValueChange={(v) => onChange(v as SeverityFilterValue)}>
      <TabsList className="w-full">
        <TabsTrigger value="all" className="text-xs gap-1">
          All <span className="text-muted-foreground">{counts.all}</span>
        </TabsTrigger>
        <TabsTrigger value="critical" className="text-xs gap-1">
          <SeverityIcon severity={2} />
          Critical <span className="text-muted-foreground">{counts.critical}</span>
        </TabsTrigger>
        <TabsTrigger value="warning" className="text-xs gap-1">
          <SeverityIcon severity={1} />
          Warning <span className="text-muted-foreground">{counts.warning}</span>
        </TabsTrigger>
        <TabsTrigger value="info" className="text-xs gap-1">
          <SeverityIcon severity={0} />
          Info <span className="text-muted-foreground">{counts.info}</span>
        </TabsTrigger>
      </TabsList>
    </Tabs>
  </div>
);
