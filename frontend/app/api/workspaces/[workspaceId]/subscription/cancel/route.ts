import { type NextRequest } from "next/server";

import { cancelSubscription } from "@/lib/actions/checkout";

type Params = { params: Promise<{ workspaceId: string }> };

export async function POST(_req: NextRequest, props: Params): Promise<Response> {
  const { workspaceId } = await props.params;

  try {
    const result = await cancelSubscription(workspaceId);
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to cancel subscription." },
      { status: 500 }
    );
  }
}
