import { NextRequest, NextResponse } from "next/server";
import { prettifyError } from "zod/v4";

import { parseUrlParams } from "@/lib/actions/common/utils";
import { createPlayground, deletePlaygrounds, getPlaygrounds, GetPlaygroundsSchema } from "@/lib/actions/playgrounds";

export async function GET(req: NextRequest, props: { params: Promise<{ projectId: string }> }) {
  try {
    const params = await props.params;
    const projectId = params.projectId;

    const parseResult = parseUrlParams(req.nextUrl.searchParams, GetPlaygroundsSchema.omit({ projectId: true }));

    if (!parseResult.success) {
      return NextResponse.json({ error: prettifyError(parseResult.error) }, { status: 400 });
    }

    const result = await getPlaygrounds({
      ...parseResult.data,
      projectId,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request, props: { params: Promise<{ projectId: string }> }) {
  try {
    const params = await props.params;
    const projectId = params.projectId;
    const body = await req.json();

    const result = await createPlayground({
      projectId,
      name: body.name,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  try {
    const params = await props.params;
    const projectId = params.projectId;

    const searchParams = req.nextUrl.searchParams;
    const playgroundIds = searchParams.get("playgroundIds")?.split(",").filter(Boolean);

    if (!playgroundIds) {
      return NextResponse.json({ error: "At least one playground id is required" }, { status: 400 });
    }

    await deletePlaygrounds({
      projectId,
      playgroundIds,
    });

    return NextResponse.json({ message: "Playgrounds deleted successfully" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
