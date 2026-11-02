import { eq } from "drizzle-orm";

import { db } from "@/lib/db/drizzle";
import { users } from "@/lib/db/migrations/schema";
import { verifyInternalRequest } from "@/lib/internal-auth";

import { type CliAlertContext, cliAlertErrorResponse } from "./cli";

/**
 * Runs an `/api/internal` alert write for app-server, acting as the CLI user it has already
 * authorized as a project member. The token carries that user's id; their email backs `notifyMe`.
 */
export async function internalAlertRoute(
  request: Request,
  projectId: string,
  write: (ctx: CliAlertContext) => Promise<unknown>
): Promise<Response> {
  const claims = await verifyInternalRequest(request, projectId);
  if (!claims?.userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, claims.userId)).limit(1);
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    return Response.json(await write({ projectId, userEmail: user.email || null }));
  } catch (error) {
    return cliAlertErrorResponse(error);
  }
}
