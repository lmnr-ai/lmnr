import { prettifyError, ZodError } from "zod/v4";

import { setOnboardingDraft } from "@/lib/actions/onboarding";

// A Route Handler rather than a Server Action: setting a cookie in a Server Action re-renders the
// onboarding page, which can remount the wizard mid-step.
export async function POST(req: Request): Promise<Response> {
  try {
    await setOnboardingDraft(await req.json());
    return Response.json({ success: true });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return Response.json({ error: "Failed to save onboarding draft" }, { status: 500 });
  }
}
