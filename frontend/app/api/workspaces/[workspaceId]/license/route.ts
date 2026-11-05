import { prettifyError, z, ZodError } from "zod/v4";

import { getServerSession } from "@/lib/auth-session";
import { getWorkspaceRole } from "@/lib/authorization";
import { Feature, isFeatureEnabled } from "@/lib/features/features";
import { LicenseRequestError, saveLicenseKey } from "@/lib/license";

const SaveLicenseSchema = z.object({ key: z.string().trim().min(1) });

// The license is instance-wide, but workspace owners manage it. There is no
// DELETE: the app-server only accepts a key that verifies, so a stored license
// can be replaced by another working one but never removed.
export async function PUT(req: Request, props: { params: Promise<{ workspaceId: string }> }): Promise<Response> {
  const { workspaceId } = await props.params;

  if (isFeatureEnabled(Feature.LAMINAR_CLOUD)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const session = await getServerSession();
  const userId = session?.user?.id;
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if ((await getWorkspaceRole(workspaceId, userId)) !== "owner") {
    return Response.json({ error: "Only workspace owners can add a license key" }, { status: 403 });
  }

  try {
    const { key } = SaveLicenseSchema.parse(await req.json());
    const status = await saveLicenseKey(key, userId);
    return Response.json(status);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    if (error instanceof LicenseRequestError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("Failed to save license:", error);
    return Response.json({ error: "Failed to save license" }, { status: 500 });
  }
}
