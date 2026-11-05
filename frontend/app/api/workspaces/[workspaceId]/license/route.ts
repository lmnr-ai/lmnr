import { z } from "zod/v4";

import { apiHandler } from "@/lib/api/api-handler";
import { AuthorizationError, NotFoundError } from "@/lib/api/errors";
import { getServerSession } from "@/lib/auth-session";
import { getWorkspaceRole } from "@/lib/authorization";
import { Feature, isFeatureEnabled } from "@/lib/features/features";
import { saveLicenseKey } from "@/lib/license";

const SaveLicenseSchema = z.object({ key: z.string().trim().min(1) });

// The license is instance-wide, but workspace owners manage it. There is no
// DELETE: the app-server only accepts a key that verifies, so a stored license
// can be replaced by another working one but never removed.
export const PUT = apiHandler<{ workspaceId: string }>(async (req, { params }) => {
  const { workspaceId } = await params;

  if (isFeatureEnabled(Feature.LAMINAR_CLOUD)) {
    throw new NotFoundError();
  }

  const session = await getServerSession();
  const userId = session?.user?.id;
  if (!userId) {
    throw new AuthorizationError("Unauthorized", 401);
  }
  if ((await getWorkspaceRole(workspaceId, userId)) !== "owner") {
    throw new AuthorizationError("Only workspace owners can add a license key", 403);
  }

  const { key } = SaveLicenseSchema.parse(await req.json());
  return Response.json(await saveLicenseKey(key, userId));
});
