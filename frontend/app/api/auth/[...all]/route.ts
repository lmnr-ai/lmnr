import { toNextJsHandler } from "better-auth/next-js";
import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db/drizzle";
import { deviceCodes } from "@/lib/db/migrations/schema";

const handlers = toNextJsHandler(auth);

export const GET = handlers.GET;

// CLI device-flow metadata delivery. BetterAuth's /device/token response is fixed
// to {access_token, scope} and DELETES the device row before responding, and a
// before-hook's setHeader does not survive to the response. So we read the row's
// `metadata` here — before BetterAuth deletes it — and attach it to the response
// as the x-lmnr-metadata header for the polling CLI. `scope` stays the real OAuth
// scope; no projectId smuggling.
export async function POST(req: NextRequest): Promise<Response> {
  if (!req.nextUrl.pathname.endsWith("/device/token")) {
    return handlers.POST(req);
  }

  let metadata: string | null = null;
  try {
    const body = (await req.clone().json()) as { device_code?: string };
    if (body?.device_code) {
      const [row] = await db
        .select({ metadata: deviceCodes.metadata, status: deviceCodes.status })
        .from(deviceCodes)
        .where(eq(deviceCodes.deviceCode, body.device_code))
        .limit(1);
      if (row?.status === "approved") metadata = row.metadata;
    }
  } catch {
    // Best-effort — never block token issuance on the metadata lookup.
  }

  const res = await handlers.POST(req);
  if (res.ok && metadata) {
    // Response headers from the handler are immutable; rebuild to attach ours.
    const out = new NextResponse(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    });
    out.headers.set("x-lmnr-metadata", metadata);
    return out;
  }
  return res;
}
