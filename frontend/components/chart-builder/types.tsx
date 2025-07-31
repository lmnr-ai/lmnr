import { ChartBar, ChartColumn, ChartLine } from "lucide-react";
import { ReactNode } from "react";

export enum ChartType {
  "LineChart" = "line",
  "BarChart" = "bar",
  "HorizontalBarChart" = "horizontalBar",
}

export interface ChartConfig {
  type?: ChartType;
  x?: string;
  y?: string;
  breakdown?: string;
  total?: boolean;
}

export const chartTypeLabelMap: Record<ChartType, { label: string; icon: ReactNode }> = {
  [ChartType.LineChart]: {
    label: "Line Chart",
    icon: <ChartLine className="w-4 h-4 mr-2" />,
  },
  [ChartType.BarChart]: {
    label: "Bar Chart",
    icon: <ChartColumn className="w-4 h-4 mr-2" />,
  },
  [ChartType.HorizontalBarChart]: {
    label: "Horizontal Bar Chart",
    icon: <ChartBar className="w-4 h-4 mr-2" />,
  },
};
