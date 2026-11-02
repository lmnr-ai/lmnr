import { createAlertFilter, deleteAlertFilters, getAlertFilters, updateAlertFilter } from "@/lib/actions/alert-filters";
import { apiHandler } from "@/lib/api/api-handler";
import { NotFoundError } from "@/lib/api/errors";

type Params = { projectId: string; alertId: string };

export const GET = apiHandler<Params>(async (_req, ctx) => {
  const { projectId, alertId } = await ctx.params;
  return Response.json(await getAlertFilters({ projectId, alertId }));
});

export const POST = apiHandler<Params>(async (req, ctx) => {
  const { projectId, alertId } = await ctx.params;
  const body = await req.json();
  return Response.json(await createAlertFilter({ projectId, alertId, filters: body.filters }));
});

export const PUT = apiHandler<Params>(async (req, ctx) => {
  const { projectId, alertId } = await ctx.params;
  const body = await req.json();
  const result = await updateAlertFilter({
    projectId,
    alertId,
    filterId: body.filterId,
    filters: body.filters,
  });

  if (!result) throw new NotFoundError("Filter not found");

  return Response.json(result);
});

export const DELETE = apiHandler<Params>(async (req, ctx) => {
  const { projectId, alertId } = await ctx.params;
  const body = await req.json();
  return Response.json(await deleteAlertFilters({ projectId, alertId, filterIds: body.filterIds }));
});
