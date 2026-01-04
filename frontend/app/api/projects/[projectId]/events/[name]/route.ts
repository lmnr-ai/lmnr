import { type NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { parseUrlParams } from "@/lib/actions/common/utils";
import { getEventsPaginated, GetEventsPaginatedSchema } from "@/lib/actions/events";

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; name: string }> }
): Promise<Response> {
  const params = await props.params;
  const { projectId, name } = params;
  const parseResult = parseUrlParams(
    req.nextUrl.searchParams,
    GetEventsPaginatedSchema.omit({ projectId: true, eventName: true })
  );

  if (!parseResult.success) {
    return Response.json({ error: prettifyError(parseResult.error) }, { status: 400 });
  }

  try {
    const result = await getEventsPaginated({ ...parseResult.data, projectId, eventName: name });
    return Response.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to fetch events." },
      { status: 500 }
    );
  }
}
