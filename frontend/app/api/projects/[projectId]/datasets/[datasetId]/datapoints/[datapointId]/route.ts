import { prettifyError, ZodError } from "zod/v4";

import { getDatapoint, updateDatapoint } from "@/lib/actions/datapoint";

export async function GET(
  req: Request,
  props: { params: Promise<{ projectId: string; datasetId: string; datapointId: string }> }
) {
  const params = await props.params;

  try {
    const datapoint = await getDatapoint({
      projectId: params.projectId,
      datapointId: params.datapointId,
      datasetId: params.datasetId,
    });

    return new Response(JSON.stringify(datapoint), { status: 200 });
  } catch (error) {
    console.error("Error fetching datapoint:", error);
    if (error instanceof Error) {
      return new Response(error.message, { status: 404 });
    }
    return new Response("Internal Server Error", { status: 500 });
  }
}

export async function POST(
  req: Request,
  props: { params: Promise<{ projectId: string; datasetId: string; datapointId: string }> }
): Promise<Response> {
  const params = await props.params;

  try {
    const body = await req.json();

    await updateDatapoint({
      projectId: params.projectId,
      datapointId: params.datapointId,
      datasetId: params.datasetId,
      data: body.data,
      target: body.target,
      metadata: body.metadata,
      createdAt: body.createdAt,
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error updating datapoint:", error);
    if (error instanceof ZodError) {
      return new Response(prettifyError(error), { status: 400 });
    }
    if (error instanceof Error) {
      return new Response(error.message, { status: 404 });
    }
    return new Response("Internal Server Error", { status: 500 });
  }
}
