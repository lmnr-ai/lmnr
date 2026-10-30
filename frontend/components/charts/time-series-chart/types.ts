import type React from "react";
import { type MouseHandlerDataParam } from "recharts";

export type TimeSeriesDataPoint = {
  timestamp: string;
} & Record<string, number>;

/** Still used by the separately animated landing-page Recharts illustration. */
export interface TimeSeriesChartConfig {
  [key: string]: {
    label: string;
    color: string;
    stackId?: string;
    icon?: React.ComponentType;
  };
}

export type CategoricalChartFunc = (nextState: MouseHandlerDataParam, event: React.SyntheticEvent) => void;
