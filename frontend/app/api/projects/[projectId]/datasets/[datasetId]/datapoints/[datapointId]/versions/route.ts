import { type NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { createDatapointVersionFromExisting, listDatapointVersions } from "@/lib/actions/datapoints/versions";

/**
 * GET - List all versions of a specific datapoint
 */
export async function GET(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; datasetId: string; datapointId: string }> }
): Promise<Response> {
  const params = await props.params;

  try {
    const versions = await listDatapointVersions({
      projectId: params.projectId,
      datasetId: params.datasetId,
      datapointId: params.datapointId,
    });

    return NextResponse.json(versions);
  } catch (error) {
    console.error("Error listing datapoint versions:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST - Create a new version from an existing version
 * Body should contain: { versionCreatedAt: string }
 */
export async function POST(
  req: Request,
  props: { params: Promise<{ projectId: string; datasetId: string; datapointId: string }> }
): Promise<Response> {
  const params = await props.params;

  try {
    const body = await req.json();

    const result = await createDatapointVersionFromExisting({
      projectId: params.projectId,
      datasetId: params.datasetId,
      datapointId: params.datapointId,
      versionCreatedAt: body.versionCreatedAt,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("Error creating datapoint version:", error);
    if (error instanceof Error && error.message === "Version not found") {
      return NextResponse.json({ error: "Version not found" }, { status: 404 });
    }
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
