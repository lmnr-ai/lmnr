import { prettifyError, ZodError } from "zod/v4";

import { isInternalRequest } from "@/lib/internal-auth";

import { DashboardError } from "./errors";

/**
 * Runs an `/api/internal` dashboard write for app-server, which has already authorized the CLI
 * user or the Laminar agent. Errors keep the `{ error }` shape and status app-server relays.
 */
export async function internalDashboardRoute(
  request: Request,
  projectId: string,
  write: () => Promise<unknown>
): Promise<Response> {
  if (!(await isInternalRequest(request, projectId))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return Response.json(await write());
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    if (error instanceof DashboardError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    // app-server logs this and answers its caller with a generic 500.
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
