import { NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { fetcherJSON } from "@/lib/utils";

export async function PATCH(
  req: Request,
  props: { params: Promise<{ projectId: string; sessionId: string }> }
) {
  try {
    const params = await props.params;
    const { sessionId, projectId } = params;
    const body = await req.json();

    // Validate required fields
    if (!body.status) {
      return NextResponse.json({ error: "status is required" }, { status: 400 });
    }

    // Validate status value
    const validStatuses = ["PENDING", "RUNNING", "FINISHED", "STOPPED"];
    if (!validStatuses.includes(body.status)) {
      return NextResponse.json(
        { error: `status must be one of: ${validStatuses.join(", ")}` },
        { status: 400 }
      );
    }

    // Call the backend API
    const result = await fetcherJSON(`/projects/${projectId}/rollouts/${sessionId}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        status: body.status,
      }),
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }

    console.error("Rollout status update error:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to update rollout session status.",
      },
      { status: 500 }
    );
  }
}

