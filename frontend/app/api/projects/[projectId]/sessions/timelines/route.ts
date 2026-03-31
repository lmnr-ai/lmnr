import { type NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { getSessionTimelines, GetSessionTimelinesSchema } from "@/lib/actions/sessions/timelines";

export async function POST(req: NextRequest, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;

  try {
    const body = await req.json();
    const input = GetSessionTimelinesSchema.parse({ ...body, projectId });
    const timelines = await getSessionTimelines(input);
    return Response.json({ timelines });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to fetch session timelines." },
      { status: 500 }
    );
  }
}
