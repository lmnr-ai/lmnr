import { prettifyError, ZodError } from "zod/v4";

type RouteContext<P extends Record<string, string>> = {
  params: Promise<P>;
};

export function handleRoute<P extends Record<string, string>, T>(handler: (req: Request, params: P) => Promise<T>) {
  return async (req: Request, ctx: RouteContext<P>) => {
    try {
      const params = await ctx.params;
      const result = await handler(req, params);
      return Response.json(result);
    } catch (error) {
      console.error(error);
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
