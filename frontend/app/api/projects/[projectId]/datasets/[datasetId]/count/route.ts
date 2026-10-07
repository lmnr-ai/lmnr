import { type NextRequest, NextResponse } from "next/server";

import { parseUrlParams } from "@/lib/actions/common/utils";
import { countDatapoints, CountDatapointsSchema } from "@/lib/actions/datapoints";

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; datasetId: string }> }
): Promise<Response> {
  const params = await props.params;

  try {
    const parseResult = parseUrlParams(
      req.nextUrl.searchParams,
      CountDatapointsSchema.omit({ projectId: true, datasetId: true })
    );

    if (!parseResult.success) {
      return NextResponse.json({ totalCount: 0 });
    }

    const countData = await countDatapoints({
      ...parseResult.data,
      projectId: params.projectId,
      datasetId: params.datasetId,
    });

    return NextResponse.json(countData);
  } catch (error) {
    console.error("Error listing datapoints:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
