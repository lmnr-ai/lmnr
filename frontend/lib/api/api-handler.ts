import * as Sentry from "@sentry/nextjs";
import { unstable_rethrow } from "next/navigation";
import { type NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { ApiError } from "./errors";

type RouteContext<P extends Record<string, string> = Record<string, string>> = {
  params: Promise<P>;
};

type RouteHandler<P extends Record<string, string>> = (req: NextRequest, ctx: RouteContext<P>) => Promise<Response>;

// Names a client disconnect surfaces under: `AbortError` from anything awaiting
// `req.signal` (fetch, the AI SDK), `ResponseAborted` from Next itself. Deliberately
// excludes the AI SDK's third abort name, `TimeoutError` — a timeout is a real
// server-side failure and must still reach Sentry.
const ABORT_ERROR_NAMES = new Set(["AbortError", "ResponseAborted"]);

// Walks the `cause` chain (like `unstable_rethrow` does) since a provider may
// re-throw the abort wrapped in its own error.
const isAbortError = (error: unknown): boolean => {
  for (let current = error, depth = 0; current != null && depth < 5; depth++) {
    const { name, cause } = current as { name?: unknown; cause?: unknown };
    if (typeof name === "string" && ABORT_ERROR_NAMES.has(name)) return true;
    current = cause;
  }
  return false;
};

/**
 * Wraps an `app/api/**` route handler and turns what it throws into the `{ error }` JSON every
 * caller (the UI's `fetchApi`, app-server's `next_api.rs`) reads: `ApiError` → its status,
 * `ZodError` → 400, anything else → 500 and Sentry.
 */
export const apiHandler =
  <P extends Record<string, string> = Record<string, string>>(handler: RouteHandler<P>): RouteHandler<P> =>
  async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (error) {
      // Must run first: re-throws Next.js control-flow errors (redirect, notFound, …).
      unstable_rethrow(error);

      // The caller hung up; nobody reads the response, so skip Sentry and answer 499.
      // Classified on the error rather than `req.signal.aborted` so a real failure
      // racing a disconnect is still captured.
      if (isAbortError(error)) {
        return new Response(null, { status: 499 });
      }

      if (error instanceof ApiError) {
        return Response.json({ error: error.message }, { status: error.status });
      }

      if (error instanceof ZodError) {
        return Response.json({ error: prettifyError(error) }, { status: 400 });
      }

      Sentry.captureException(error, { tags: { source: "apiHandler" } });

      return Response.json(
        { error: error instanceof Error ? error.message : "Internal server error" },
        { status: 500 }
      );
    }
  };
