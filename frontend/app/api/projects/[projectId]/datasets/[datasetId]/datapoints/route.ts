import { NextRequest, NextResponse } from "next/server";

import { createDatapoints, CreateDatapointsSchema, deleteDatapoints, getDatapoints } from "@/lib/actions/datapoints";

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; datasetId: string }> }
): Promise<Response> {
  const params = await props.params;

  try {
    const pastHours = req.nextUrl.searchParams.get("pastHours");
    const startTime = req.nextUrl.searchParams.get("startDate");
    const endTime = req.nextUrl.searchParams.get("endDate");
    const pageNumber = parseInt(req.nextUrl.searchParams.get("pageNumber") ?? "0") || 0;
    const pageSize = parseInt(req.nextUrl.searchParams.get("pageSize") ?? "50") || 50;

    const datapointsData = await getDatapoints({
      datasetId: params.datasetId,
      pastHours,
      startTime,
      endTime,
      pageNumber,
      pageSize,
    });

    return NextResponse.json(datapointsData);
  } catch (error) {
    console.error("Error listing datapoints:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  props: { params: Promise<{ projectId: string; datasetId: string }> }
): Promise<Response> {
  const params = await props.params;

  try {
    const body = await req.json();

    // Validate request body
    const parseResult = CreateDatapointsSchema.safeParse(body);
    if (!parseResult.success) {
      return new Response(
        JSON.stringify({
          error: "Invalid request body",
          details: parseResult.error.issues,
        }),
        { status: 400 }
      );
    }

    const { datapoints, sourceSpanId } = parseResult.data;

    const result = await createDatapoints({
      projectId: params.projectId,
      datasetId: params.datasetId,
      datapoints,
      sourceSpanId,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("Error creating datapoints:", error);
    if (error instanceof Error && error.message === "Error creating datasetDatapoints") {
      return new Response("Error creating datasetDatapoints", { status: 500 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; datasetId: string }> }
): Promise<Response> {
  const params = await props.params;

  try {
    const searchParams = req.nextUrl.searchParams;
    const datapointIds = searchParams.get("datapointIds")?.split(",");

    if (!datapointIds) {
      return new Response("At least one Datapoint ID is required", { status: 400 });
    }

    await deleteDatapoints({
      datasetId: params.datasetId,
      datapointIds,
    });

    return new Response("datasetDatapoints deleted successfully", { status: 200 });
  } catch (error) {
    console.error("Error deleting datapoints:", error);
    return new Response("Error deleting datasetDatapoints", { status: 500 });
  }
}
