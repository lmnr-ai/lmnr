import { prettifyError, z, ZodError } from "zod/v4";

import { setOnboardingDraft } from "@/lib/actions/onboarding";
import { MAX_ONBOARDING_INVITES } from "@/lib/actions/onboarding/types";
import { getServerSession } from "@/lib/auth-session";

const DraftSchema = z.object({
  step: z.enum(["workspace", "invite", "signals", "plan"]),
  workspaceName: z.string().max(200),
  projectName: z.string().max(200),
  invites: z.array(z.email()).max(MAX_ONBOARDING_INVITES),
  templateNames: z.array(z.string().max(200)).max(50),
});

// A Route Handler rather than a Server Action: setting a cookie in a Server Action re-renders the
// onboarding page, which can remount the wizard mid-step.
export async function POST(req: Request): Promise<Response> {
  const session = await getServerSession();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const draft = DraftSchema.parse(await req.json());
    await setOnboardingDraft({ ...draft, userId: session.user.id });
    return Response.json({ success: true });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return Response.json({ error: "Failed to save onboarding draft" }, { status: 500 });
  }
}
