import { type NextRequest } from "next/server";

import { decryptValue } from "@/lib/crypto";

import { apiHandler } from "./api-handler";

export const INTERNAL_TOKEN_HEADER = "x-laminar-internal-token";

// app-server mints tokens for 60s; the cap only bounds how long a leaked one could be replayed.
const MAX_TOKEN_LIFETIME_SECS = 300;

export interface InternalClaims {
  /** The caller app-server authorized and acts for, when the write needs one (alert `notifyMe`). */
  userId?: string;
}

/**
 * The claims of the request's app-server token for `projectId` (app-server `next_api.rs`), or null
 * when it has none or it is invalid. The token is `{exp, userId?}` encrypted with the shared
 * `AEAD_SECRET_KEY` and the project id as associated data, so only app-server can mint one and it
 * is valid for that project alone.
 */
export async function verifyInternalRequest(request: Request, projectId: string): Promise<InternalClaims | null> {
  const [nonce, value, ...rest] = request.headers.get(INTERNAL_TOKEN_HEADER)?.split(".") ?? [];
  if (!nonce || !value || rest.length > 0) return null;

  try {
    const { exp, userId } = JSON.parse(await decryptValue(`internal-api:${projectId}`, nonce, value)) as {
      exp?: unknown;
      userId?: unknown;
    };
    const now = Date.now() / 1000;
    if (typeof exp !== "number" || exp <= now || exp > now + MAX_TOKEN_LIFETIME_SECS) return null;
    return typeof userId === "string" ? { userId } : {};
  } catch {
    return null;
  }
}

type InternalHandler<P> = (request: NextRequest, ctx: { params: P; claims: InternalClaims }) => Promise<Response>;

/**
 * Wraps an `/api/internal/projects/[projectId]/…` route handler (called by app-server's
 * `next_api.rs`): answers 401 unless the request carries app-server's token for `projectId`, then
 * maps errors like any `apiHandler` route.
 */
export const internalApiHandler = <P extends Record<string, string> & { projectId: string }>(
  handler: InternalHandler<P>
) =>
  apiHandler<P>(async (request, ctx) => {
    const params = await ctx.params;
    const claims = await verifyInternalRequest(request, params.projectId);
    if (!claims) return Response.json({ error: "Unauthorized" }, { status: 401 });
    return handler(request, { params, claims });
  });
