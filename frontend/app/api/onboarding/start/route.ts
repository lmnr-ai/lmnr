import { prettifyError, ZodError } from "zod/v4";

import { startOnboarding } from "@/lib/actions/onboarding/commit";

// A Route Handler rather than a Server Action: setting a cookie in a Server Action re-renders the
// onboarding page, which can remount the wizard mid-step.
export async function POST(req: Request): Promise<Response> {
  try {
    return Response.json(await startOnboarding(await req.json()));
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    console.error("Onboarding start failed", error);
    return Response.json({ error: "Failed to create your workspace." }, { status: 500 });
  }
}
