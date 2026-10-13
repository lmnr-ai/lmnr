import { type NextRequest } from "next/server";

import { endTrialNow } from "@/lib/actions/checkout/trial";

type Params = { params: Promise<{ workspaceId: string }> };

export async function POST(_req: NextRequest, props: Params): Promise<Response> {
  const { workspaceId } = await props.params;

  try {
    await endTrialNow(workspaceId);
    return Response.json({ success: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to start the subscription." },
      { status: 500 }
    );
  }
}
