import { type NextRequest } from "next/server";
import { prettifyError, z, ZodError } from "zod/v4";

import { setTrialContinues, startStarterTrial, trialConvertsToPaid } from "@/lib/actions/checkout/trial";

type Params = { params: Promise<{ workspaceId: string }> };

export async function GET(_req: NextRequest, props: Params): Promise<Response> {
  const { workspaceId } = await props.params;

  try {
    return Response.json({ convertsToPaid: await trialConvertsToPaid(workspaceId) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to load the trial." },
      { status: 500 }
    );
  }
}

export async function POST(_req: NextRequest, props: Params): Promise<Response> {
  const { workspaceId } = await props.params;

  try {
    const result = await startStarterTrial({ workspaceId, source: "billing" });
    return Response.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to start the free trial." },
      { status: 500 }
    );
  }
}

const PatchSchema = z.object({ continues: z.boolean() });

export async function PATCH(req: NextRequest, props: Params): Promise<Response> {
  const { workspaceId } = await props.params;

  try {
    const { continues } = PatchSchema.parse(await req.json());
    await setTrialContinues(workspaceId, continues);
    return Response.json({ success: true });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to update the trial." },
      { status: 500 }
    );
  }
}
