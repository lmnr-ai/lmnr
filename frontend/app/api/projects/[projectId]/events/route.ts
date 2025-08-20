import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { prettifyError, ZodError } from "zod/v4";

import { getEvents, GetEventsSchema } from "@/lib/actions/events";
import { authOptions } from "@/lib/auth";

export async function GET(req: NextRequest, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;
  const pageSize = req.nextUrl.searchParams.get("pageSize");
  const pageNumber = req.nextUrl.searchParams.get("pageNumber");
  const search = req.nextUrl.searchParams.get("search");
  const filters = req.nextUrl.searchParams.getAll("filter");
  const startDate = req.nextUrl.searchParams.get("startDate");
  const endDate = req.nextUrl.searchParams.get("endDate");
  const pastHours = req.nextUrl.searchParams.get("pastHours");

  const parseResult = GetEventsSchema.safeParse({
    projectId,
    pageSize,
    pageNumber,
    search,
    filter: filters,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    pastHours: pastHours || undefined,
  });

  if (!parseResult.success) {
    return Response.json({ error: prettifyError(parseResult.error) }, { status: 400 });
  }

  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = session.user;
    const result = await getEvents(parseResult.data, user.apiKey);

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
