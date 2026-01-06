import { NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

export async function PATCH(req: Request, props: { params: Promise<{ projectId: string; sessionId: string }> }) {
  try {
    const params = await props.params;
    const { sessionId, projectId } = params;
    const body = await req.json();

    const res = await fetch(`${process.env.BACKEND_URL}/api/v1/projects/${projectId}/rollouts/${sessionId}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        status: body.status,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: text || "Failed to update status" }, { status: res.status });
    }

    // Handle empty response body from backend
    const text = await res.text();
    const result = text ? JSON.parse(text) : { success: true };

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to update rollout session status.",
      },
      { status: 500 }
    );
  }
}
