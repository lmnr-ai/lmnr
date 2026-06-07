import { type NextRequest, NextResponse } from "next/server";
import { prettifyError, z, ZodError } from "zod/v4";

import { authenticateInstance, getBearerToken, redeemClaim } from "@/lib/actions/slack/broker";

const RedeemRequestSchema = z.object({
  claim: z.string(),
});

// Server-to-server: the calling instance authenticates with its issued key and
// redeems the one-time claim. The claim is bound to the instance that started
// the flow, so one tenant can never redeem another's token.
export async function POST(req: NextRequest): Promise<Response> {
  try {
    const instanceId = await authenticateInstance(getBearerToken(req.headers.get("authorization")) ?? "");
    if (!instanceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { claim } = RedeemRequestSchema.parse(await req.json());
    const payload = await redeemClaim(claim, instanceId);
    if (!payload) {
      return NextResponse.json({ error: "Invalid or expired claim" }, { status: 400 });
    }

    return NextResponse.json({
      token: payload.token,
      teamId: payload.teamId,
      teamName: payload.teamName,
    });
  } catch (error) {
    console.error("Slack broker /redeem error:", error);
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
