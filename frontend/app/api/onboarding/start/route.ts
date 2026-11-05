import { prettifyError, ZodError } from "zod/v4";

import { startOnboarding } from "@/lib/actions/onboarding/commit";
import { withAudit } from "@/lib/audit";

// A Route Handler rather than a Server Action: setting a cookie in a Server Action re-renders the
// onboarding page, which can remount the wizard mid-step.
export const POST = withAudit(
  { resource: "workspace", action: "create" },
  async (req: Request, _ctx: { params: Promise<{}> }, audit): Promise<Response> => {
    try {
      const result = await startOnboarding(await req.json());
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
