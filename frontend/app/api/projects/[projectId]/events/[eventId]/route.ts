import { type NextRequest } from "next/server";

import { getEventById } from "@/lib/actions/events";

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; eventId: string }> }
): Promise<Response> {
  const { projectId, eventId } = await props.params;

  try {
    const event = await getEventById(projectId, eventId);
    if (!event) {
      return Response.json({ error: "Event not found" }, { status: 404 });
    }
    return Response.json(event);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Failed to fetch event." }, { status: 500 });
  }
}
