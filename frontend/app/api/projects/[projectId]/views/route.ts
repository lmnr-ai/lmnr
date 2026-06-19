import { NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { createView } from "@/lib/actions/view";
import { getViews } from "@/lib/actions/views";

export async function GET(req: Request, props: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await props.params;
    const url = new URL(req.url);

    const resource = url.searchParams.get("resource");

    if (!resource) {
      return NextResponse.json({ error: "resource query parameter is required" }, { status: 400 });
    }

    const views = await getViews({ projectId, resource });

    return NextResponse.json(views);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get views. Please try again." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request, props: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await props.params;
    const body = await req.json();

    const result = await createView({
      projectId,
      resource: body.resource,
      name: body.name,
      config: body.config,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create view. Please try again." },
      { status: 500 }
    );
  }
}
