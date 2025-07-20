import { getDatapoint, updateDatapoint, UpdateDatapointRequestSchema } from "@/lib/actions/datapoint";

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

    // This schema allows any JSON value for data and target,
    // but for file upload we will need to dump everything into data,
    // unless the keys match "data", "target", or "metadata"
    const result = UpdateDatapointRequestSchema.safeParse(body);
    if (!result.success) {
      console.error("Invalid request body", result.error);
      return new Response("Invalid request body", { status: 400 });
    }

    const { data, target, metadata, createdAt } = result.data;

    await updateDatapoint({
      projectId: params.projectId,
      datapointId: params.datapointId,
      datasetId: params.datasetId,
      data,
      target,
      metadata,
      createdAt,
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error updating datapoint:", error);
    if (error instanceof Error) {
      return new Response(error.message, { status: 404 });
    }
    return new Response("Internal Server Error", { status: 500 });
  }
}
