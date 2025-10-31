import { NextRequest, NextResponse } from "next/server";

import { countDatapoints } from "@/lib/actions/datapoints";

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; datasetId: string }> }
): Promise<Response> {
  const params = await props.params;

  try {
    const countData = await countDatapoints({
      projectId: params.projectId,
      datasetId: params.datasetId,
    });

    return NextResponse.json(countData);
  } catch (error) {
    console.error("Error listing datapoints:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
