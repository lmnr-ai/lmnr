import { type NextRequest } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { extractBearerToken, looksLikeJwt, verifyAccessToken } from "@/lib/oauth/verify";

export interface Caller {
  userId: string;
  email: string | null;
  name: string | null;
}

/**
 * Authenticate the caller via OAuth JWT bearer (CLI) OR NextAuth session
 * cookie (browser). Returns null when neither is present/valid.
 *
 * Shared by every `/api/cli/*` route — the OAuth dual-auth pattern.
 */
export async function resolveCaller(req: NextRequest): Promise<Caller | null> {
  const bearer = extractBearerToken(req.headers.get("authorization"));
  if (bearer && looksLikeJwt(bearer)) {
    try {
      const claims = await verifyAccessToken(bearer);
      return { userId: claims.sub, email: claims.email, name: null };
    } catch {
      return null;
    }
  }
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  return {
    userId: session.user.id,
    email: session.user.email ?? null,
    name: session.user.name ?? null,
  };
}
