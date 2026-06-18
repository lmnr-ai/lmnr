import { type NextRequest, NextResponse } from "next/server";
import { prettifyError, z, ZodError } from "zod/v4";

import { authenticateInstance, buildSlackAuthorizeUrl, getBearerToken, mintState } from "@/lib/actions/slack/broker";

const StartRequestSchema = z.object({
  workspaceId: z.guid(),
  returnUrl: z.url(),
});

// Server-to-server: the calling instance authenticates with its issued key and
// receives a Slack authorize URL carrying a signed state. The instance then
// redirects the browser to that URL — the instance key never enters a browser.
export async function POST(req: NextRequest): Promise<Response> {
  try {
    const instanceId = await authenticateInstance(getBearerToken(req.headers.get("authorization")) ?? "");
    if (!instanceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspaceId, returnUrl } = StartRequestSchema.parse(await req.json());
    const { state, codeChallenge } = await mintState({ instanceId, workspaceId, returnUrl });
    const authorizeUrl = buildSlackAuthorizeUrl(state, codeChallenge);

    return NextResponse.json({ authorizeUrl });
  } catch (error) {
    console.error("Slack broker /start error:", error);
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
