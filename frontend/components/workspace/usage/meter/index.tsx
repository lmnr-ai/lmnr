"use client";

import { useMemo } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { ElevatedSurface } from "@/components/ui/surface";
import { type MeterModel, trimZeros } from "@/components/workspace/usage/utils";
import { type BillingCycle, buildDailySeries } from "@/lib/billing/usage-estimate";

import { type StatRow } from "../usage-stats";
import UsageChart from "./usage-chart";

interface UsageMeterCardProps {
  title: string;
  meter: MeterModel;
  // undefined while loading.
  days: { date: string; value: number }[] | undefined;
  cycle: BillingCycle;
  color: string;
  format: (value: number) => string;
  formatTick: (value: number) => string;
  stats?: StatRow[];
}

export default function UsageMeterCard(props: UsageMeterCardProps) {
  const { title, meter, days, cycle, color, format, formatTick, stats } = props;
  const { used, included } = meter;
  const series = useMemo(() => (days ? buildDailySeries(days, cycle) : null), [days, cycle]);

  return (
    <ElevatedSurface className="flex flex-col gap-3 rounded-lg p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium">{title}</span>
        <div className="flex flex-col items-end">
          <span className="text-xl font-semibold tabular-nums">{format(used)}</span>
          {included != null && (
            <span className="text-xs text-muted-foreground">first {trimZeros(format(included))} included</span>
          )}
        </div>
      </div>

      {series ? (
        <UsageChart points={series} color={color} format={format} formatTick={formatTick} />
      ) : (
        <Skeleton className="h-40" />
      )}

      {stats && (
        <dl className="mt-auto flex flex-col gap-1.5 text-xs">
          {stats.map((row) => (
            <div key={row.label} className="flex justify-between gap-2">
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd className="tabular-nums">{row.value ?? <Skeleton className="h-4 w-12" />}</dd>
            </div>
          ))}
        </dl>
      )}
    </ElevatedSurface>
  );
}
