import * as Sentry from "@sentry/nextjs";
import { unstable_rethrow } from "next/navigation";
import { type NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

type RouteContext<P extends Record<string, string> = Record<string, string>> = {
  params: Promise<P>;
};

type RouteHandler<P extends Record<string, string>> = (req: NextRequest, ctx: RouteContext<P>) => Promise<Response>;

export function apiHandler<P extends Record<string, string> = Record<string, string>>(
  handler: RouteHandler<P>
): RouteHandler<P> {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (error) {
      unstable_rethrow(error);
      if (error instanceof ZodError) {
        return Response.json({ error: prettifyError(error) }, { status: 400 });
      }
      Sentry.withScope((scope) => {
        scope.setTags({
          "http.method": req.method,
          "http.route": req.nextUrl.pathname,
          source: "apiHandler",
        });
        Sentry.captureException(error);
      });
      return Response.json(
        { error: error instanceof Error ? error.message : "Internal server error" },
        { status: 500 }
      );
    }
  };
}
