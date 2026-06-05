import { type NextRequest } from "next/server";

import { hashApiKey } from "@/lib/api-keys";
import { getRefreshTokenByHash, revokeFamily } from "@/lib/oauth/refresh-tokens";
import { oauthError, parseOAuthBody } from "@/lib/oauth/request";

/**
 * RFC 7009 token revocation endpoint.
 *
 * Accepts a `token` (required) and optional `token_type_hint`
 * (`refresh_token` | `access_token`) in either JSON or form-urlencoded body,
 * same shape as `/oauth/token`.
 *
 * Semantics:
 * - `refresh_token` (or absent hint): hash the token, look up the row, revoke
 *   the entire family. RFC 7009 §2.2 — the response MUST be 200 regardless of
 *   whether the token existed or was already revoked; leaking existence is a
 *   privacy/security hole.
 * - `access_token`: we issue stateless RS256 JWTs with no revocation list, so
 *   there is nothing to invalidate server-side. RFC 7009 §2.1 ALLOWS the AS
 *   to also revoke the associated refresh token in that case, but our access
 *   tokens are 1h-lived and the JWT does not carry a refresh-family pointer,
 *   so we just no-op. Document this limitation here; the canonical revoke
 *   flow is for clients to call with the refresh token on logout.
 *
 * Public endpoint — `token_endpoint_auth_methods_supported: ["none"]`.
 */
export async function POST(req: NextRequest): Promise<Response> {
  try {
    let body: Record<string, string>;
    try {
      body = await parseOAuthBody(req);
    } catch {
      return oauthError("invalid_request", "Malformed body");
    }

    const token = body.token;
    if (!token) {
      return oauthError("invalid_request", "token is required");
    }
    const hint = body.token_type_hint;

    if (hint === "access_token") {
      // No-op: access tokens are stateless JWTs and we have no revocation list.
      return new Response(null, {
        status: 200,
        headers: { "cache-control": "no-store" },
      });
    }

    // Default path: treat as refresh token. Look up by hash; if unknown,
    // return 200 anyway (RFC 7009 §2.2 - do not leak existence).
    const hash = hashApiKey(token);
    const row = await getRefreshTokenByHash(hash);
    if (row) {
      await revokeFamily(row.familyId);
    }
    return new Response(null, {
      status: 200,
      headers: { "cache-control": "no-store" },
    });
  } catch (err) {
    console.error("Unhandled error in POST /oauth/revoke", err);
    return oauthError("server_error", "Unexpected server error");
  }
}
