import { NextRequest, NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { parseUrlParams } from "@/lib/actions/common/utils";
import { createDataset, deleteDatasets, getDatasets, getDatasetsSchema } from "@/lib/actions/datasets";

export async function POST(req: Request, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;
  const body = await req.json();
  const { name } = body;

  try {
    const dataset = await createDataset({ name, projectId });
    return NextResponse.json(dataset, { status: 200 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to create dataset" }, { status: 500 });
  }
}

export async function GET(req: NextRequest, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;

  const parseResult = parseUrlParams(
    req.nextUrl.searchParams,
    getDatasetsSchema.omit({ projectId: true }),
    ["filter"]
  );

  if (!parseResult.success) {
    return NextResponse.json({ error: prettifyError(parseResult.error) }, { status: 400 });
  }

  try {
    const response = await getDatasets({
      ...parseResult.data,
      projectId,
    });
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to get datasets" }, { status: 500 });
  }

}

export async function DELETE(req: Request, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;

  const { searchParams } = new URL(req.url);
  const datasetIds = searchParams.get("datasetIds")?.split(",");

  if (!datasetIds) {
    return NextResponse.json({ error: "At least one Dataset ID is required" }, { status: 400 });
  }

  try {
    await deleteDatasets({ projectId, datasetIds });

    return NextResponse.json({ message: "datasets deleted successfully" }, { status: 200 });
  } catch (error) {
    console.error("Error deleting datasets:", error);
    return NextResponse.json({ error: "Error deleting datasets" }, { status: 500 });
  }
}
