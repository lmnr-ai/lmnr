import { ChartBar, ChartColumn, ChartLine, type LucideIcon } from "lucide-react";

import { ChartType } from "@/components/chart-builder/types";

/** Chart types the SQL chart builder offers, in the order they are shown. */
export const CHART_TYPE_OPTIONS: { type: ChartType; label: string; icon: LucideIcon }[] = [
  { type: ChartType.LineChart, label: "Line chart", icon: ChartLine },
  { type: ChartType.BarChart, label: "Bar chart", icon: ChartColumn },
  { type: ChartType.HorizontalBarChart, label: "Horizontal bar chart", icon: ChartBar },
];
