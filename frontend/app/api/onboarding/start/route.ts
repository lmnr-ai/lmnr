import { prettifyError, ZodError } from "zod/v4";

import { startOnboarding } from "@/lib/actions/onboarding/commit";
import { handlerWithAudit } from "@/lib/audit";

// A Route Handler rather than a Server Action: setting a cookie in a Server Action re-renders the
// onboarding page, which can remount the wizard mid-step.
export const POST = handlerWithAudit(
  { resource: "workspace", action: "create" },
  async (req: Request, _ctx: { params: Promise<{}> }, audit): Promise<Response> => {
    try {
      const { created, ...result } = await startOnboarding(await req.json());
      // A double submit or second tab resumes the workspace it already created.
      if (!created) audit.skip();
      audit.set({ workspaceId: result.workspaceId, metadata: { onboarding: true } });
      await audit.target(result.workspaceId);
      return Response.json(result);
    } catch (error) {
      if (error instanceof ZodError) {
        return Response.json({ error: prettifyError(error) }, { status: 400 });
      }
      console.error("Onboarding start failed", error);
      return Response.json({ error: "Failed to create your workspace." }, { status: 500 });
    }
  }
);
