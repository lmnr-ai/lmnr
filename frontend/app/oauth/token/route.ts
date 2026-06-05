import { type NextRequest } from "next/server";

import { DEVICE_GRANT, handleDeviceCodeGrant } from "@/lib/oauth/grants/device-code";
import { handleRefreshTokenGrant } from "@/lib/oauth/grants/refresh";
import { oauthError, parseOAuthBody } from "@/lib/oauth/request";

/**
 * RFC 6749 token endpoint. Dispatches on `grant_type` to the appropriate
 * grant handler in `lib/oauth/grants/`. Every error path returns a JSON body
 * with an `error` field per RFC 6749 §5.2 — including unexpected exceptions,
 * which the outer try/catch maps to `server_error`.
 */
export async function POST(req: NextRequest): Promise<Response> {
  try {
    let body: Record<string, string>;
    try {
      body = await parseOAuthBody(req);
    } catch {
      return oauthError("invalid_request", "Malformed body");
    }

    const grantType = body.grant_type;
    if (grantType === DEVICE_GRANT) {
      return await handleDeviceCodeGrant(body);
    }
    if (grantType === "refresh_token") {
      return await handleRefreshTokenGrant(body);
    }
    return oauthError("unsupported_grant_type", `Unsupported grant_type: ${grantType ?? "<missing>"}`);
  } catch (err) {
    console.error("Unhandled error in POST /oauth/token", err);
    return oauthError("server_error", "Unexpected server error");
  }
}
