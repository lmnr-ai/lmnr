import { deleteDashboardChart, getChart, updateChart, updateChartName } from "@/lib/actions/dashboard";
import { handleRoute } from "@/lib/api/route-handler";

export const GET = handleRoute<{ projectId: string; id: string }, unknown>(async (_req, params) => {
  const { projectId, id } = params;

  const chart = await getChart({ projectId, id });

  if (!chart) {
    throw new Error("Chart not found");
  }

  return chart;
});

export const DELETE = handleRoute<{ projectId: string; id: string }, unknown>(async (_req, params) => {
  const { projectId, id } = params;

  await deleteDashboardChart({ projectId, id });
  return { success: true };
});

export const PATCH = handleRoute<{ projectId: string; id: string }, unknown>(async (req, params) => {
  const { projectId, id } = params;
  const body = await req.json();

  await updateChartName({ projectId, id, ...body });
  return { success: true };
});

export const PUT = handleRoute<{ projectId: string; id: string }, unknown>(async (req, params) => {
  const { projectId, id } = params;
  const body = await req.json();

  return await updateChart({ projectId, id, ...body });
});
