import { type NextRequest } from "next/server";

/** Parses a POST body as either JSON or form-urlencoded into a plain object. */
export async function parseOAuthBody(req: NextRequest): Promise<Record<string, string>> {
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    const json = (await req.json()) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(json)) {
      if (v != null) out[k] = String(v);
    }
    return out;
  }
  // application/x-www-form-urlencoded (or anything else — fall back to URLSearchParams).
  const text = await req.text();
  const params = new URLSearchParams(text);
  const out: Record<string, string> = {};
  params.forEach((v, k) => {
    out[k] = v;
  });
  return out;
}

export function oauthError(error: string, description?: string, status = 400): Response {
  const body: Record<string, string> = { error };
  if (description) body.error_description = description;
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}
