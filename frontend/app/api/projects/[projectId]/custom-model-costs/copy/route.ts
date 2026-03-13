import { getServerSession } from "next-auth";

import { copyCustomModelCosts } from "@/lib/actions/custom-model-costs";
import { handleRoute } from "@/lib/api/route-handler";
import { authOptions } from "@/lib/auth";
import { isUserMemberOfProject } from "@/lib/authorization";

export const POST = handleRoute<{ projectId: string }, unknown>(async (req, params) => {
  const body = await req.json();
  const targetProjectId = body.targetProjectId;

  if (!targetProjectId) {
    throw new Error("targetProjectId is required");
  }

  // The source project (params.projectId) is implicitly authorized via DB filtering,
  // consistent with other project routes. The target project needs an explicit check
  // because it comes from the request body and is not covered by the URL path.
  const session = await getServerSession(authOptions);
  if (!session) {
    throw new Error("Unauthorized");
  }
  if (!(await isUserMemberOfProject(targetProjectId, session.user.id))) {
    throw new Error("Forbidden: no access to target project");
  }

  const result = await copyCustomModelCosts({
    sourceProjectId: params.projectId,
    targetProjectId,
  });

  if (result.length === 0) {
    throw new Error("No custom model costs found in source project");
  }

  return result;
});
