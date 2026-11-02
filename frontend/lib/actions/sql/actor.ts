import { z } from "zod/v4";

import { getServerSession } from "@/lib/auth-session";

/**
 * Who is reading. The app-server derives its role-based read policy from this
 * (docs/internal/rbac.md), so it must come from the server session or from
 * trusted server code — never from a request body. `cli`/`apiKey` only arrive
 * from app-server on `/api/internal` calls (`lib/internal-auth.ts`).
 */
export type SqlActor = { type: "user"; userId: string } | { type: "shared" } | { type: "cli" } | { type: "apiKey" };

export const SqlActorSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("user"), userId: z.guid() }),
  z.object({ type: z.literal("shared") }),
  z.object({ type: z.literal("cli") }),
  z.object({ type: z.literal("apiKey") }),
]);

export const SHARED_ACTOR: SqlActor = { type: "shared" };

/**
 * Explicit actor (public share-link actions pass `SHARED_ACTOR`), else the
 * signed-in user, else the share-link viewer: a session-less read can only
 * ever get the most restrictive policy.
 */
export const resolveSqlActor = async (actor?: SqlActor): Promise<SqlActor> => {
  if (actor) return actor;
  const session = await getServerSession();
  return session ? { type: "user", userId: session.user.id } : SHARED_ACTOR;
};
