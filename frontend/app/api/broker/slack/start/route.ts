import { type NextRequest, NextResponse } from "next/server";
import { prettifyError, z, ZodError } from "zod/v4";

import { authenticateInstance, buildSlackAuthorizeUrl, getBearerToken, mintState } from "@/lib/actions/slack/broker";
import { handlerNoAudit } from "@/lib/audit";

const StartRequestSchema = z.object({
  workspaceId: z.guid(),
  returnUrl: z.url(),
  // "link" starts Sign in with Slack for the instance's user instead of a bot install.
  kind: z.literal("link").optional(),
  teamId: z.string().optional(),
});

// Server-to-server: the calling instance authenticates with its issued key and
// receives a Slack authorize URL carrying a signed state. The instance then
// redirects the browser to that URL — the instance key never enters a browser.
export const POST = handlerNoAudit(
  "Laminar Cloud Slack broker for self-hosted instances; not a workspace action",
  async (req: NextRequest): Promise<Response> => {
    try {
      const instanceId = authenticateInstance(getBearerToken(req.headers.get("authorization")) ?? "");
      if (!instanceId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const { workspaceId, returnUrl, kind, teamId } = StartRequestSchema.parse(await req.json());
      const { state, codeChallenge, payload } = await mintState({ instanceId, workspaceId, returnUrl, kind, teamId });
      const authorizeUrl = buildSlackAuthorizeUrl(state, codeChallenge, payload);

      return NextResponse.json({ authorizeUrl });
    } catch (error) {
      console.error("Slack broker /start error:", error);
      if (error instanceof ZodError) {
        return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
      }
      return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
    }
  }
);
