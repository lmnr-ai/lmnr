import { type NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { getTrialPaymentUrl } from "@/lib/actions/checkout/trial";

type Params = { params: Promise<{ workspaceId: string }> };

export async function POST(req: NextRequest, props: Params): Promise<Response> {
  const { workspaceId } = await props.params;

  try {
    const body = await req.json();
    const url = await getTrialPaymentUrl({ workspaceId, returnUrl: body.returnUrl, endTrialNow: body.endTrialNow });
    return Response.json({ url });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to open payment setup." },
      { status: 500 }
    );
  }
}
