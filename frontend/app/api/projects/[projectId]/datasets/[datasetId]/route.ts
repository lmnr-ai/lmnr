import { and, eq } from "drizzle-orm";

import { updateDataset } from "@/lib/actions/dataset";
import { apiHandler } from "@/lib/api/api-handler";
import { db } from "@/lib/db/drizzle";
import { datasets } from "@/lib/db/migrations/schema";

export const GET = apiHandler<{ projectId: string; datasetId: string }>(async (req, ctx) => {
  const { projectId, datasetId } = await ctx.params;

  const dataset = await db.query.datasets.findFirst({
    where: and(eq(datasets.id, datasetId), eq(datasets.projectId, projectId)),
  });

  return Response.json(dataset ?? null);
});

export const PATCH = apiHandler<{ projectId: string; datasetId: string }>(async (req, ctx) => {
  const { projectId, datasetId } = await ctx.params;

  const body = await req.json();
  const { name } = body;

  const updatedDataset = await updateDataset({
    projectId,
    datasetId,
    name,
  });

  return Response.json(updatedDataset);
});
