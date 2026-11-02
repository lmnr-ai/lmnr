import { prettifyError, ZodError } from "zod/v4";

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

/** An expected failure of an `/api/internal` write; `withInternal` answers `{ error }` with `status`. */
export class InternalApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "InternalApiError";
  }
}

type InternalHandler<P> = (request: Request, ctx: { params: P; claims: InternalClaims }) => Promise<Response>;

/**
 * Wraps an `/api/internal/projects/[projectId]/…` route handler: answers 401 unless the request
 * carries app-server's token for `projectId`, and maps thrown errors to the `{ error }` JSON
 * app-server relays (`InternalApiError` → its status, `ZodError` → 400, anything else → 500).
 */
export function withInternal<P extends { projectId: string }>(handler: InternalHandler<P>) {
  return async (request: Request, props: { params: Promise<P> }): Promise<Response> => {
    const params = await props.params;
    const claims = await verifyInternalRequest(request, params.projectId);
    if (!claims) return Response.json({ error: "Unauthorized" }, { status: 401 });

    try {
      return await handler(request, { params, claims });
    } catch (error) {
      if (error instanceof InternalApiError) return Response.json({ error: error.message }, { status: error.status });
      if (error instanceof ZodError) return Response.json({ error: prettifyError(error) }, { status: 400 });
      console.error(`internal route ${request.method} ${new URL(request.url).pathname} failed:`, error);
      return Response.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}
