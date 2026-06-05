import { type NextRequest } from "next/server";
import { z } from "zod/v4";

import { createDeviceCode, DEVICE_CODE_TTL_SECONDS, POLL_INTERVAL_SECONDS } from "@/lib/oauth/device-codes";
import { getIssuer } from "@/lib/oauth/jwt";
import { oauthError, parseOAuthBody } from "@/lib/oauth/request";

const BodySchema = z.object({
  client_id: z.string().min(1),
  scope: z.string().optional(),
  project_id: z.string().uuid().optional(),
});

// TODO(rate-limit): this endpoint is publicly accessible and writes one
// `oauth_device_codes` row per call with no per-IP or per-client_id rate
// limiting. Combined with the deferred janitor for expired rows, an
// unauthenticated caller can accumulate rows freely (cheap, but unbounded).
// Defer to a follow-up that adds rate-limiting infrastructure to the
// frontend (no shared primitive exists today — app-server's
// `actix_limitation::Limiter` is on a different process). The same
// infrastructure will want to apply to /oauth/token polling and
// /api/oauth/device/decision once it exists. Track alongside the janitor
// TODO in CLAUDE.md.
export async function POST(req: NextRequest): Promise<Response> {
  try {
    const raw = await parseOAuthBody(req);
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return oauthError("invalid_request", parsed.error.issues.map((i) => i.message).join("; "));
    }
    const { client_id, scope, project_id } = parsed.data;

    const row = await createDeviceCode({
      clientId: client_id,
      scope: scope || "projects:rw",
      requestedProjectId: project_id ?? null,
    });

    const issuer = getIssuer();
    const verificationUri = `${issuer}/oauth/device`;
    const verificationUriComplete = `${verificationUri}?user_code=${encodeURIComponent(row.userCode)}`;

    return new Response(
      JSON.stringify({
        device_code: row.deviceCode,
        user_code: row.userCode,
        verification_uri: verificationUri,
        verification_uri_complete: verificationUriComplete,
        expires_in: DEVICE_CODE_TTL_SECONDS,
        interval: POLL_INTERVAL_SECONDS,
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
          "cache-control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error("device authorize error:", error);
    return oauthError("server_error", error instanceof Error ? error.message : undefined, 500);
  }
}
