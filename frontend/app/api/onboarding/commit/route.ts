import { prettifyError, ZodError } from "zod/v4";

import { commitOnboarding } from "@/lib/actions/onboarding/commit";
import { withAudit } from "@/lib/audit";

export const POST = withAudit(
  { resource: "workspace", action: "update" },
  async (req: Request, _ctx: { params: Promise<{}> }, audit): Promise<Response> => {
    try {
      const result = await commitOnboarding(await req.json());
      audit.set({
        workspaceId: result.workspaceId,
        resourceId: result.workspaceId,
        metadata: { onboarding: true, failedInvites: result.failedInvites },
      });
      return Response.json(result);
    } catch (error) {
      if (error instanceof ZodError) {
        return Response.json({ error: prettifyError(error) }, { status: 400 });
      }
      console.error("Onboarding commit failed", error);
      return Response.json(
        { error: error instanceof Error ? error.message : "Failed to set up your workspace." },
        { status: 500 }
      );
    }
  }
);
