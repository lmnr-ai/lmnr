import { and, eq } from "drizzle-orm";
import { prettifyError, ZodError } from "zod/v4";

import { updateDataset } from "@/lib/actions/dataset";
import { db } from "@/lib/db/drizzle";
import { datasets } from "@/lib/db/migrations/schema";

export async function GET(
  req: Request,
  props: { params: Promise<{ projectId: string; datasetId: string }> }
): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;
  const datasetId = params.datasetId;

  const dataset = await db.query.datasets.findFirst({
    where: and(eq(datasets.id, datasetId), eq(datasets.projectId, projectId)),
  });

  return new Response(JSON.stringify(dataset), { status: 200 });
}

export async function PATCH(
  req: Request,
  props: { params: Promise<{ projectId: string; datasetId: string }> }
): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;
  const datasetId = params.datasetId;

  try {
    const body = await req.json();
    const { name } = body;

    const updatedDataset = await updateDataset({
      projectId,
      datasetId,
      name,
    });

    return new Response(JSON.stringify(updatedDataset));
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }

    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to update dataset. Please try again." },
      { status: 500 }
    );
  }
}
