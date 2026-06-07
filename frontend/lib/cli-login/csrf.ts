import { type NextRequest } from "next/server";

/**
 * Same-origin check for session-authed write endpoints (OWASP-recommended
 * defense-in-depth on top of SameSite=Lax). Browsers always attach `Origin`
 * on POSTs from page contexts; an absent or mismatched origin is either a
 * non-browser caller or a cross-site forgery attempt.
 *
 * We compare canonical `URL.origin` (scheme + host + port) against
 * NEXTAUTH_URL so trailing-slash and path variants do not cause false
 * rejections.
 *
 * Returns null on success. On failure returns the 403 Response to short-circuit.
 */
export function requireSameOrigin(req: NextRequest): Response | null {
  const origin = req.headers.get("origin");
  if (!origin) {
    return Response.json({ error: "missing_origin" }, { status: 403 });
  }
  const expected = process.env.NEXTAUTH_URL;
  if (!expected) {
    return Response.json({ error: "forbidden_origin" }, { status: 403 });
  }
  let reqOrigin: string;
  let expectedOrigin: string;
  try {
    reqOrigin = new URL(origin).origin;
    expectedOrigin = new URL(expected).origin;
  } catch {
    return Response.json({ error: "invalid_origin" }, { status: 403 });
  }
  if (reqOrigin !== expectedOrigin) {
    return Response.json({ error: "forbidden_origin" }, { status: 403 });
  }
  return null;
}
