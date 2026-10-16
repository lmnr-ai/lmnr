import { type ChartConfig } from "@/components/chart-builder/types";
import { type QueryStructure } from "@/lib/actions/sql/types";

export interface Dashboard {
  id: string;
  name: string;
  createdAt: string;
  chartCount: number;
}

export interface DashboardChart {
  id: string;
  dashboardId: string;
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

export const GRID_COLS = 12;

export const getDashboardsUrl = (projectId: string) => `/api/projects/${projectId}/dashboards`;

export const getChartsUrl = (projectId: string, dashboardId: string) =>
  `/api/projects/${projectId}/dashboards/${dashboardId}/charts`;
