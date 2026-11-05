import { type NextRequest } from "next/server";
import { prettifyError } from "zod/v4";

import { parseUrlParams } from "@/lib/actions/common/utils";
import { createDataset, deleteDatasets, getDatasets, getDatasetsSchema } from "@/lib/actions/datasets";
import { apiHandler } from "@/lib/api/api-handler";
import { withAudit } from "@/lib/audit";

export const POST = withAudit<{ projectId: string }>({ resource: "dataset", action: "create" }, async (req, ctx) => {
  const { projectId } = await ctx.params;
  const body = await req.json();
  const { name } = body;

  const dataset = await createDataset({ name, projectId });
  return Response.json(dataset, { status: 200 });
});

export const GET = apiHandler<{ projectId: string }>(async (req: NextRequest, ctx) => {
  const { projectId } = await ctx.params;

  const parseResult = parseUrlParams(req.nextUrl.searchParams, getDatasetsSchema.omit({ projectId: true }));

  if (!parseResult.success) {
    return Response.json({ error: prettifyError(parseResult.error) }, { status: 400 });
  }

  const response = await getDatasets({
    ...parseResult.data,
    projectId,
  });
  return Response.json(response, { status: 200 });
});

export const DELETE = withAudit<{ projectId: string }>({ resource: "dataset", action: "delete" }, async (req, ctx) => {
  const { projectId } = await ctx.params;

  const { searchParams } = new URL(req.url);
  const datasetIds = searchParams.get("datasetIds")?.split(",");

  if (!datasetIds) {
    return Response.json({ error: "At least one Dataset ID is required" }, { status: 400 });
  }

  await deleteDatasets({ projectId, datasetIds });

  return Response.json({ message: "datasets deleted successfully" }, { status: 200 });
});
