import { and, eq } from "drizzle-orm";

import { updateDataset } from "@/lib/actions/dataset";
import { handleRoute } from "@/lib/api/route-handler";
import { db } from "@/lib/db/drizzle";
import { datasets } from "@/lib/db/migrations/schema";

export const GET = handleRoute<{ projectId: string; datasetId: string }, unknown>(async (_req, params) => {
  const dataset = await db.query.datasets.findFirst({
    where: and(eq(datasets.id, params.datasetId), eq(datasets.projectId, params.projectId)),
  });

  return dataset;
});

export const PATCH = handleRoute<{ projectId: string; datasetId: string }, unknown>(async (req, params) => {
  const body = await req.json();
  const { name } = body;

  return await updateDataset({
    projectId: params.projectId,
    datasetId: params.datasetId,
    name,
  });
});
