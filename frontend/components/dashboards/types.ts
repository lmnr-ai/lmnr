import { type ChartConfig } from "@/components/chart-builder/types";
import { type QueryStructure } from "@/lib/actions/sql/types";

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
    queryStructure?: QueryStructure | null;
  };
  query: string;
  createdAt: string;
}

export const dragHandleKey = "drag-handle";
