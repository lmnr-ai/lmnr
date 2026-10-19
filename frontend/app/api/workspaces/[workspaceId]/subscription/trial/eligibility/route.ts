import { type NextRequest } from "next/server";

import { canStartStarterTrial } from "@/lib/actions/checkout/trial";

type Params = { params: Promise<{ workspaceId: string }> };

export async function GET(_req: NextRequest, props: Params): Promise<Response> {
  const { workspaceId } = await props.params;

  try {
    return Response.json({ eligible: await canStartStarterTrial(workspaceId) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to check trial eligibility." },
      { status: 500 }
    );
  }
}
