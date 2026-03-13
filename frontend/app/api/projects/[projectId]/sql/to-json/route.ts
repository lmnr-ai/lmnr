import { getServerSession } from "next-auth";

import { sqlToJson } from "@/lib/actions/sql";
import { handleRoute } from "@/lib/api/route-handler";
import { authOptions } from "@/lib/auth";

export const POST = handleRoute<{ projectId: string }, unknown>(async (req, params) => {
  const session = await getServerSession(authOptions);

  if (!session) {
    throw new Error("Unauthorized");
  }

  const body = await req.json();
  const data = await sqlToJson({ projectId: params.projectId, sql: body.sql });

  return { success: true, jsonStructure: JSON.stringify(data) };
});
