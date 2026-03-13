import { type NextRequest } from "next/server";

import { cancelSubscription } from "@/lib/actions/checkout";
import { type CancellationReason } from "@/lib/actions/checkout/types";

type Params = { params: Promise<{ workspaceId: string }> };

export async function POST(req: NextRequest, props: Params): Promise<Response> {
  const { workspaceId } = await props.params;

  try {
    const body = await req.json().catch(() => ({}));
    const reason = (body.reason as CancellationReason) ?? "other";
    const comment = typeof body.comment === "string" ? body.comment : "";

    const result = await cancelSubscription(workspaceId, reason, comment);
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to cancel subscription." },
      { status: 500 }
    );
  }
}
