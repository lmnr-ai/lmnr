import * as Sentry from "@sentry/nextjs";
import { unstable_rethrow } from "next/navigation";
import { type NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

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

export function apiHandler<P extends Record<string, string> = Record<string, string>>(
  handler: RouteHandler<P>
): RouteHandler<P> {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (error) {
      // Must run BEFORE any other catch-block logic. Re-throws Next.js internal
      // errors (redirect, notFound, permanentRedirect, etc.) so the framework
      // can handle them correctly. Real application errors fall through.
      unstable_rethrow(error);

      // The caller hung up (navigated away, superseded an in-flight fetch, closed
      // the tab) — nothing to report and nobody left to read the response, so skip
      // Sentry (fetchApi excludes aborts for the same reason) and answer 499
      // (client closed request). Classified on the error rather than on
      // `req.signal.aborted` so a real failure racing a disconnect is still captured.
      if (isAbortError(error)) {
        return new Response(null, { status: 499 });
      }

      Sentry.captureException(error, { tags: { source: "apiHandler" } });

      if (error instanceof ZodError) {
        return Response.json({ error: prettifyError(error) }, { status: 400 });
      }

      return Response.json(
        { error: error instanceof Error ? error.message : "Internal server error" },
        { status: 500 }
      );
    }
  };
}
