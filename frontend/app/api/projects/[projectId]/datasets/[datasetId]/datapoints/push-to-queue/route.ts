import { NextResponse } from "next/server";

import { pushDatapointsToQueue, PushDatapointsToQueueSchema } from "@/lib/actions/datapoints";

export async function POST(
  req: Request,
  props: { params: Promise<{ projectId: string; datasetId: string }> }
): Promise<Response> {
  const params = await props.params;

  try {
    const body = await req.json();

    const result = PushDatapointsToQueueSchema.omit({ datasetId: true }).safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: "Invalid request body", details: result.error.issues }, { status: 400 });
    }

    const { datapointIds, queueId } = result.data;

    const queueItems = await pushDatapointsToQueue({
      datapointIds,
      datasetId: params.datasetId,
      queueId,
    });

    return NextResponse.json({
      success: true,
      message: `Successfully pushed ${datapointIds.length} datapoints to queue`,
      queueItems,
    });
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
