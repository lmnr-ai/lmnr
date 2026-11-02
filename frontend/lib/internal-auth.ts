import { decryptValue } from "@/lib/crypto";

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
