import { type ComponentType, type ReactNode } from "react";

export interface PlotSeries {
  key: string;
  label: string;
  color: string;
  /** Optional symbol displayed alongside this series in a custom tooltip. */
  icon?: ReactNode;
}

export interface PlotTooltipItem extends PlotSeries {
  value: number;
}

export interface PlotTooltipProps {
  x: string;
  label: string;
  items: PlotTooltipItem[];
  /** Whether the pointer is over the plotted stack rather than empty space in its bucket. */
  overBar: boolean;
}

export type PlotTooltip = ComponentType<PlotTooltipProps>;

export interface PlotRange {
  start: string;
  end: string;
}

/** Use for persistent/linked selections; otherwise onRangeSelect manages a transient drag. */
export interface ControlledSelection {
  range: PlotRange | null;
  onChange: (range: PlotRange, phase: "start" | "move" | "end") => void;
}

/** A timestamp annotation, snapped to the containing x bucket by the plot. */
export interface PlotMarker {
  timestamp: string;
  label: string;
  href?: string;
  tooltip?: { label: string; timestamp: string }[];
}
