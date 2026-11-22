"use client";

import { type ChartPoint, barY, defineChart, ruleX, text } from "@tanstack/charts";
import { crosshair } from "@tanstack/charts/crosshair";
import { Chart } from "@tanstack/charts/react/tooltip";
import { tooltip } from "@tanstack/charts/tooltip";
import { portal } from "@tanstack/charts/tooltip/portal";
import { type ReactNode, useCallback, useMemo } from "react";
import useSWR from "swr";

import "@/components/chart-builder/charts/cartesian-chart/styles.css";

import { xScale, yScale } from "@/components/chart-builder/charts/cartesian-chart/axes";
import { type SeriesRow } from "@/components/chart-builder/charts/cartesian-chart/definition";
import TooltipBody from "@/components/chart-builder/charts/cartesian-chart/tooltip-body";
import { barIndexOf, dayLabel } from "@/components/signal-clusters/cluster-detail/dates";
import { type ClusterResolution, type ClusterVersionMarker } from "@/lib/actions/signal-clusters/types";
import { swrFetcher } from "@/lib/api/fetch-api";
import { fixedCountTicks } from "@/lib/charts/y-ticks";

const RESOLVED_COLOR = "var(--color-success)";
const VERSION_COLOR = "var(--color-muted-foreground)";
const REOPENED_COLOR = "var(--color-yellow-text)";
// Same muting as dashboard bars.
const BAR_OPACITY = 0.7;
const LABEL_FONT = 10;

interface Marker {
  x: string;
  label: string;
}

interface Props {
  projectId: string;
  signalId: string;
  /** null for unclustered events, which have no versions or resolutions to mark. */
  clusterId: string | null;
  daily: number[];
  resolutions: ClusterResolution[];
  days: string[];
  /** The first bar's start when bars are 24h counted from a range start; without it, `days` are UTC dates. */
  start?: string;
  /** The range ends at "now", so markers after the last bar's end still sit on it. */
  toNow?: boolean;
  color: string;
  /** Off where the page already says these are events. */
  showTitle?: boolean;
  /** Replaces the "Events" title, e.g. with a date range picker. */
  heading?: ReactNode;
  barOpacity?: number;
}

/** Markers on the bar their timestamp falls in; ones outside the window have no bar to sit on. */
const markersAt = (bar: (iso: string) => number, items: { at: string; label: string }[]): Marker[] =>
  items.flatMap(({ at, label }) => {
    const i = bar(at);
    return i >= 0 ? [{ x: String(i), label }] : [];
  });

/** Daily event counts, drawn with TanStack Charts like dashboards, plus agent-version and resolution rules. */
export default function FrequencyChart({
  projectId,
  signalId,
  clusterId,
  daily,
  resolutions,
  days,
  start,
  toNow,
  color,
  showTitle = true,
  heading,
  barOpacity = BAR_OPACITY,
}: Props) {
  const { data: versionData } = useSWR<ClusterVersionMarker[]>(
    clusterId ? `/api/projects/${projectId}/signals/${signalId}/clusters/${clusterId}/versions` : null,
    swrFetcher
  );

  // Bars are keyed by index: at a DST change two 24h bars can share a local date, and x values must be unique.
  const formatX = useCallback((i: string) => dayLabel(days[Number(i)] ?? ""), [days]);

  const { definition, present } = useMemo(() => {
    const rows: SeriesRow[] = daily.map((value, i) => ({ x: String(i), series: "Events", value }));
    const top = fixedCountTicks(Math.max(1, ...daily), 5).at(-1)!;
    const bar = (iso: string) => barIndexOf(days, iso, start, toNow);
    const versions = markersAt(
      bar,
      (versionData ?? []).map((v) => ({ at: v.firstSeen, label: v.label }))
    );
    // One marker per bar, for that bar's latest change, so a resolve/reopen/resolve in one day draws one line.
    const changes = resolutions
      .flatMap((r) => [
        { at: r.resolvedAt, label: "Resolved" },
        ...(r.reopenedAt ? [{ at: r.reopenedAt, label: "Reopened" }] : []),
      ])
      .sort((a, b) => a.at.localeCompare(b.at));
    const latestPerDay = [...new Map(changes.map((c) => [bar(c.at), c])).values()];
    const resolved = markersAt(
      bar,
      latestPerDay.filter((c) => c.label === "Resolved")
    );
    const reopened = markersAt(
      bar,
      latestPerDay.filter((c) => c.label === "Reopened")
    );
    // Resolution labels sit above the plot and version labels just inside it, so the rows never collide.
    const label = (markers: Marker[], fill: string, row: "above" | "inside") =>
      text(markers, {
        x: "x",
        y: () => top,
        text: "label",
        fill,
        fontSize: LABEL_FONT,
        dy: row === "above" ? -10 : 6,
        dx: 3,
        anchor: "start",
      });

    const definition = defineChart({
      marks: [
        crosshair({ x: { band: { fill: "var(--color-emphasis-2)", fillOpacity: 1 } }, y: false }),
        barY(rows, { x: "x", y: "value", color: "series", inset: 0, radius: [3, 3, 0, 0], fillOpacity: barOpacity }),
        ruleX(versions, { x: "x", stroke: VERSION_COLOR, strokeOpacity: 1, strokeDasharray: "4 3" }),
        ruleX(resolved, { x: "x", stroke: RESOLVED_COLOR, strokeOpacity: 1, strokeWidth: 2 }),
        ruleX(reopened, { x: "x", stroke: REOPENED_COLOR, strokeOpacity: 1, strokeDasharray: "2 2" }),
        label(versions, VERSION_COLOR, "inside"),
        label(resolved, RESOLVED_COLOR, "above"),
        label(reopened, REOPENED_COLOR, "above"),
      ],
      margin: { top: 20 },
      scales: { x: xScale("bar", { time: false, formatTick: formatX, formatTooltip: formatX }), y: yScale(top) },
      color: { domain: ["Events"], range: [color] },
      focus: "group-x",
      focusRing: false,
      maxFocusDistance: Number.POSITIVE_INFINITY,
      tooltip: {
        use: tooltip,
        portal,
        anchor: "pointer",
        placement: ["right", "left"],
        offset: 12,
        sticky: false,
        className: "ts-dashboard-tooltip",
      },
      svgAnimation: true,
    });
    const present = { versions: versions.length > 0, resolved: resolved.length > 0, reopened: reopened.length > 0 };
    return { definition, present };
  }, [daily, resolutions, days, start, toNow, versionData, color, barOpacity, formatX]);

  const legend = present.versions || present.resolved || present.reopened;

  return (
    <div className="flex flex-col gap-2">
      {(showTitle || legend) && (
        <div className="flex items-center justify-end gap-4 text-xs text-muted-foreground">
          {showTitle && (
            <div className="mr-auto">{heading ?? <h3 className="text-sm font-medium text-foreground">Events</h3>}</div>
          )}
          {/* Only lines actually drawn in this window get a legend entry. */}
          {present.versions && <Legend color={VERSION_COLOR} dashed label="Agent version" />}
          {present.resolved && <Legend color={RESOLVED_COLOR} label="Marked resolved" />}
          {present.reopened && <Legend color={REOPENED_COLOR} dashed label="Reopened" />}
        </div>
      )}
      <div className="h-[160px] w-full text-xs [&_*:focus]:outline-none">
        <Chart
          definition={definition}
          ariaLabel="Events per day"
          style={{ height: "100%" }}
          renderTooltipBody={({ points }) => (
            <TooltipBody points={points as readonly ChartPoint<SeriesRow, string, number>[]} formatX={formatX} />
          )}
        />
      </div>
    </div>
  );
}

function Legend({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-3 w-0 border-l-2" style={{ borderColor: color, borderStyle: dashed ? "dashed" : "solid" }} />
      {label}
    </span>
  );
}
