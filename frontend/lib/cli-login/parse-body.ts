import { type NextRequest } from "next/server";

// Parse a request's JSON body, distinguishing a malformed/non-JSON body from a
// schema-validation failure. `req.json()` throws a SyntaxError on a non-JSON
// body BEFORE any zod validation runs, so without this guard that throw escapes
// the route's ZodError branch and surfaces as a 500 leaking an internal parse
// message. Returns either the parsed value or a 400 Response to short-circuit.
export async function parseJsonBody(req: NextRequest): Promise<{ data: unknown } | { error: Response }> {
  try {
    return { data: await req.json() };
  } catch {
    return { error: Response.json({ error: "invalid_json" }, { status: 400 }) };
  }
}
