import { NextRequest, NextResponse } from "next/server";

import {
  createDatapointVersionFromExisting,
  CreateDatapointVersionSchema,
  listDatapointVersions,
} from "@/lib/actions/datapoints/versions";

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

    // Validate request body
    const parseResult = CreateDatapointVersionSchema.safeParse({
      ...body,
      projectId: params.projectId,
      datasetId: params.datasetId,
      datapointId: params.datapointId,
    });

    if (!parseResult.success) {
      return new Response(
        JSON.stringify({
          error: "Invalid request body",
          details: parseResult.error.issues,
        }),
        { status: 400 }
      );
    }

    const result = await createDatapointVersionFromExisting(parseResult.data);

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("Error creating datapoint version:", error);
    if (error instanceof Error && error.message === "Version not found") {
      return NextResponse.json({ error: "Version not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

