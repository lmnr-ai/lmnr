import { type NextRequest, NextResponse } from "next/server";
import { prettifyError } from "zod/v4";

import { parseUrlParams } from "@/lib/actions/common/utils";
import { createQueue, deleteQueues, getQueues, GetQueuesSchema } from "@/lib/actions/queues";

export async function POST(req: Request, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  try {
    const params = await props.params;
    const projectId = params.projectId;

    const body = await req.json();

    const queue = await createQueue({
      projectId,
      name: body.name,
    });

    return NextResponse.json(queue);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  try {
    const params = await props.params;
    const projectId = params.projectId;

    const parseResult = parseUrlParams(req.nextUrl.searchParams, GetQueuesSchema.omit({ projectId: true }));

    if (!parseResult.success) {
      return NextResponse.json({ error: prettifyError(parseResult.error) }, { status: 400 });
    }

    const queuesData = await getQueues({
      ...parseResult.data,
      projectId,
    });

    return NextResponse.json(queuesData);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  try {
    const params = await props.params;
    const projectId = params.projectId;

    const { searchParams } = new URL(req.url);
    const queueIds = searchParams.get("queueIds")?.split(",");

    if (!queueIds) {
      return NextResponse.json({ error: "At least one Queue ID is required" }, { status: 400 });
    }

    await deleteQueues({
      projectId,
      queueIds,
    });

    return NextResponse.json({ message: "Queues deleted successfully" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
