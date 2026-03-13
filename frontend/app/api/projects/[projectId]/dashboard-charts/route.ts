import { createChart, getCharts, updateChartsLayout } from "@/lib/actions/dashboard";
import { handleRoute } from "@/lib/api/route-handler";

export const GET = handleRoute<{ projectId: string }, unknown>(async (_req, params) => {
  const { projectId } = params;
  return await getCharts({ projectId });
});

export const PATCH = handleRoute<{ projectId: string }, unknown>(async (req, params) => {
  const { projectId } = params;
  const body = await req.json();

  await updateChartsLayout({ projectId, ...body });
  return { success: true };
});

export const POST = handleRoute<{ projectId: string }, unknown>(async (req, params) => {
  const { projectId } = params;
  const body = await req.json();

  return await createChart({
    projectId,
    ...body,
  });
});
