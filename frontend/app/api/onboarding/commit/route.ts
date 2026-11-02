import { prettifyError, ZodError } from "zod/v4";

import { commitOnboarding } from "@/lib/actions/onboarding/commit";

export async function POST(req: Request): Promise<Response> {
  try {
    const result = await commitOnboarding(await req.json());
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
