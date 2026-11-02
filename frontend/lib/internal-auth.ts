import { decryptValue } from "@/lib/crypto";

export const INTERNAL_TOKEN_HEADER = "x-laminar-internal-token";

// app-server mints tokens for 60s; the cap only bounds how long a leaked one could be replayed.
const MAX_TOKEN_LIFETIME_SECS = 300;

/**
 * Whether the request carries an app-server token for `projectId` (app-server `next_api.rs`).
 * The token is `{exp}` encrypted with the shared `AEAD_SECRET_KEY` and the project id as
 * associated data, so only app-server can mint one and it is valid for that project alone.
 */
export async function isInternalRequest(request: Request, projectId: string): Promise<boolean> {
  const [nonce, value, ...rest] = request.headers.get(INTERNAL_TOKEN_HEADER)?.split(".") ?? [];
  if (!nonce || !value || rest.length > 0) return false;

  try {
    const { exp } = JSON.parse(await decryptValue(`internal-api:${projectId}`, nonce, value)) as { exp?: unknown };
    const now = Date.now() / 1000;
    return typeof exp === "number" && exp > now && exp <= now + MAX_TOKEN_LIFETIME_SECS;
  } catch {
    return false;
  }
}
