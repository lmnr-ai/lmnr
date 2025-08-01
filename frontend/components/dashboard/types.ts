import { ChartConfig } from "@/components/chart-builder/types";

export interface DashboardChart {
  id: string;
  name: string;
  settings: {
    config: ChartConfig;
    layout: {
      x: number;
      y: number;
      w: number;
      h: number;
    };
  };
  query: string;
  createdAt: string;
}

export const dragHandleKey = "drag-handle";
