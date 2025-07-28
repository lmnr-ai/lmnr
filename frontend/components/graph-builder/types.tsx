import { ChartBar, ChartColumn, ChartLine } from "lucide-react";
import { ReactNode } from "react";

export enum GraphType {
  "LineGraph" = "line",
  "BarGraph" = "bar",
  "HorizontalBarGraph" = "horizontalBar",
}

export interface ChartConfig {
  type?: GraphType;
  x?: string;           // column name for x-axis
  y: string[];         // column names for y-axis
  breakdown?: string;   // column name for breakdown (line charts)
  enableTimeRange?: boolean;
}

export const graphTypeLabelMap: Record<GraphType, { label: string; icon: ReactNode }> = {
  [GraphType.LineGraph]: {
    label: "Line Graph",
    icon: <ChartLine className="w-4 h-4 mr-2" />,
  },
  [GraphType.BarGraph]: {
    label: "Bar Graph",
    icon: <ChartColumn className="w-4 h-4 mr-2" />,
  },
  [GraphType.HorizontalBarGraph]: {
    label: "Horizontal Bar Graph",
    icon: <ChartBar className="w-4 h-4 mr-2" />,
  },
};
