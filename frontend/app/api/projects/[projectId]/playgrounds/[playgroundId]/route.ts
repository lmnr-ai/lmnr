import { prettifyError, z } from "zod/v4";

import { updatePlayground } from "@/lib/actions/playgrounds";

export async function POST(req: Request, props: { params: Promise<{ projectId: string; playgroundId: string }> }) {
  try {
    const params = await props.params;
    const body = await req.json();

    const result = await updatePlayground({
      ...body,
      projectId: params.projectId,
      playgroundId: params.playgroundId,
    });

    return Response.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return Response.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}
