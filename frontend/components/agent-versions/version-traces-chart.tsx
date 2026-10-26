"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { Bar, BarChart, BarStack, CartesianGrid, ReferenceArea, XAxis, YAxis } from "recharts";

import { type CategoricalChartFunc } from "@/components/charts/time-series-chart/types";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import DateRangeFilter from "@/components/ui/date-range-filter";
import { type AgentVersionItem, type AgentVersionTracesPoint } from "@/lib/actions/agents";
import { numberFormatter } from "@/lib/charts/format";
import { isValidZoomRange, normalizeTimeRange, selectNiceTicksFromData } from "@/lib/charts/time";

import { DEFAULT_PAST_HOURS, versionColor } from "./utils";

interface VersionTracesChartProps {
  agentId: string;
  versions: AgentVersionItem[];
  data: AgentVersionTracesPoint[];
}

const tooltipFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
});

export default function VersionTracesChart({ agentId, versions, data }: VersionTracesChartProps) {
  const router = useRouter();
  const pathName = usePathname();
  const searchParams = useSearchParams();
  const [refArea, setRefArea] = useState<{ left?: string; right?: string }>({});

  // Oldest first so the newest version stacks on top.
  const ordered = useMemo(() => [...versions].reverse(), [versions]);

  const config = useMemo<ChartConfig>(
    () =>
      Object.fromEntries(
        ordered.map((v) => [
          v.id,
          { label: `Version ${v.versionNumber}`, color: versionColor(agentId, v.versionNumber) },
        ])
      ),
    [agentId, ordered]
  );

  const rangeValue = useMemo(() => {
    const startDate = searchParams.get("startDate") ?? undefined;
    const endDate = searchParams.get("endDate") ?? undefined;
    const pastHours = searchParams.get("pastHours") ?? (startDate ? undefined : DEFAULT_PAST_HOURS);
    return { pastHours, startDate, endDate };
  }, [searchParams]);

  const setRange = useCallback(
    (value: { pastHours?: string; startDate?: string; endDate?: string }) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const key of ["pastHours", "startDate", "endDate"] as const) {
        const next = value[key];
        if (next) params.set(key, next);
        else params.delete(key);
      }
      router.push(`${pathName}?${params.toString()}`);
    },
    [pathName, router, searchParams]
  );

  const ticks = useMemo(() => selectNiceTicksFromData(data.map((d) => d.timestamp)), [data]);

  const zoom = useCallback(() => {
    if (!isValidZoomRange(refArea.left, refArea.right)) {
      setRefArea({});
      return;
    }
    const { start, end } = normalizeTimeRange(refArea.left!, refArea.right!);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("pastHours");
    params.set("startDate", start);
    params.set("endDate", end);
    router.push(`${pathName}?${params.toString()}`);
    setRefArea({});
  }, [refArea.left, refArea.right, pathName, router, searchParams]);

  const onMouseDown: CategoricalChartFunc = useCallback((e) => {
    if (e?.activeLabel != null) setRefArea({ left: String(e.activeLabel) });
  }, []);

  const onMouseMove: CategoricalChartFunc = useCallback(
    (e) => {
      if (refArea.left && e?.activeLabel != null) setRefArea({ left: refArea.left, right: String(e.activeLabel) });
    },
    [refArea.left]
  );

  return (
    <div className="flex flex-col gap-2 rounded-md border bg-secondary p-3 pb-0">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">Traces per version</span>
        <DateRangeFilter mode="state" value={rangeValue} onChange={setRange} />
      </div>
      <ChartContainer config={config} className="h-48 w-full">
        <BarChart
          data={data}
          margin={{ left: 0, right: 8, top: 8, bottom: 4 }}
          barCategoryGap={2}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={zoom}
          style={{ userSelect: "none", cursor: "crosshair" }}
        >
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="timestamp"
            tickLine={false}
            axisLine={false}
            ticks={ticks?.ticks}
            tickFormatter={ticks?.formatter}
          />
          <YAxis tickLine={false} axisLine={false} tickFormatter={numberFormatter.format} width="auto" />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(_, payload) =>
                  payload?.[0] ? tooltipFormatter.format(new Date(payload[0].payload.timestamp)) : "-"
                }
              />
            }
          />
          <BarStack radius={[4, 4, 4, 4]}>
            {ordered.map((v) => (
              <Bar
                key={v.id}
                dataKey={v.id}
                fill={versionColor(agentId, v.versionNumber)}
                fillOpacity={0.7}
                stackId="stack"
              />
            ))}
          </BarStack>
          {refArea.left && refArea.right && (
            <ReferenceArea
              x1={refArea.left}
              x2={refArea.right}
              stroke="var(--color-primary)"
              strokeDasharray="5 5"
              strokeOpacity={0.5}
              fill="var(--color-primary)"
              fillOpacity={0.3}
            />
          )}
        </BarChart>
      </ChartContainer>
    </div>
  );
}
