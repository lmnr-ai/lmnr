import { eq } from "drizzle-orm";

import { auth } from "@/lib/auth";
import { isUserMemberOfProject } from "@/lib/authorization";
import { db } from "@/lib/db/drizzle";
import { users } from "@/lib/db/migrations/schema";

export interface CliUser {
  id: string;
  email: string | null;
}

export type CliProjectAuth = { user: CliUser } | { error: string; status: 401 | 403 };

/**
 * Authorizes a `/api/cli/projects/:projectId/*` request. The bearer is the CLI's Better Auth access
 * JWT (`GET /api/auth/token`), which app-server forwards unchanged. These routes are publicly
 * reachable, so they verify it themselves instead of trusting the caller.
 */
export async function authorizeCliProject(request: Request, projectId: string): Promise<CliProjectAuth> {
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer\s+(.+)$/i)?.[1]
    ?.trim();
  if (!token) return { error: "Unauthorized", status: 401 };

  const { payload } = await auth.api.verifyJWT({ body: { token } });
  if (!payload?.sub) return { error: "Unauthorized", status: 401 };

  if (!(await isUserMemberOfProject(projectId, payload.sub))) {
    return { error: "You do not have access to this project", status: 403 };
  }
  const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, payload.sub)).limit(1);
  if (!user) return { error: "Unauthorized", status: 401 };
  return { user: { id: payload.sub, email: user.email || null } };
}
