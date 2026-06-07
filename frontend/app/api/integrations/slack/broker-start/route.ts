import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod/v4";

import { authOptions } from "@/lib/auth";
import { isUserMemberOfWorkspace } from "@/lib/authorization";

// Brokered (self-hosted) Slack connect entrypoint. The connect button links the
// browser here; this route calls the Laminar Cloud broker's /start with the
// instance's issued key (server-to-server, key never enters the browser), then
// 302s the browser to the Slack authorize URL the broker returns.
//
// The returnUrl we hand the broker points back at this instance's callback with
// the workspaceId embedded, since the broker echoes only claim + team info on
// the way back — the instance must carry its own workspace context.
export async function GET(request: NextRequest): Promise<Response> {
  const brokerUrl = process.env.SLACK_BROKER_URL;
  const instanceKey = process.env.SLACK_BROKER_INSTANCE_KEY;
  const baseUrl = process.env.NEXT_PUBLIC_URL;

  const workspaceId = request.nextUrl.searchParams.get("workspaceId");
  const returnPath = request.nextUrl.searchParams.get("returnPath");

  // Fall back to the request origin so a missing NEXT_PUBLIC_URL still yields a
  // valid absolute redirect target (NextResponse.redirect rejects a malformed
  // `undefined/...` URL) rather than throwing from the misconfiguration path.
  const errorBase = baseUrl ?? request.nextUrl.origin;
  const errorRedirect = `${errorBase}/workspace/${workspaceId ?? ""}?tab=integrations&slack=error`;

  if (!brokerUrl || !instanceKey || !baseUrl) {
    console.error(
      "Slack broker connect attempted without SLACK_BROKER_URL / SLACK_BROKER_INSTANCE_KEY / NEXT_PUBLIC_URL"
    );
    return NextResponse.redirect(errorRedirect);
  }
  // Validate workspaceId as a UUID up front (matching the direct OAuth path's
  // z.guid()) so a malformed id fails fast here instead of embedding garbage in
  // the broker returnUrl and bouncing off the broker's own z.guid() with a 400.
  if (workspaceId === null || !z.guid().safeParse(workspaceId).success) {
    return NextResponse.redirect(errorRedirect);
  }

  // This route is browser-facing (the connect button links the browser here), so
  // the session cookie is present. Require a signed-in user who belongs to the
  // workspace before driving broker state creation and Slack authorization —
  // otherwise anyone who can hit this URL could complete a Slack install for a
  // workspace they don't belong to, mirroring the gate the callback enforces
  // before redeeming the resulting claim.
  const session = await getServerSession(authOptions);
  if (!session || !(await isUserMemberOfWorkspace(workspaceId, session.user.id))) {
    return NextResponse.redirect(errorRedirect);
  }

  const callback = new URL(`${baseUrl.replace(/\/+$/, "")}/api/integrations/slack`);
  callback.searchParams.set("workspaceId", workspaceId);
  if (returnPath) {
    callback.searchParams.set("returnPath", returnPath);
  }

  try {
    const response = await fetch(`${brokerUrl.replace(/\/+$/, "")}/api/broker/slack/start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${instanceKey}`,
      },
      body: JSON.stringify({ workspaceId, returnUrl: callback.toString() }),
    });

    if (!response.ok) {
      console.error(`Slack broker /start failed with status ${response.status}`);
      return NextResponse.redirect(errorRedirect);
    }

    const { authorizeUrl } = (await response.json()) as { authorizeUrl: string };
    // The broker always returns a slack.com authorize URL; validate the host
    // before forwarding it as a browser redirect so a misconfigured
    // SLACK_BROKER_URL or a compromised broker can't turn this into an open
    // redirect to an arbitrary target.
    let authorizeHost: string;
    try {
      authorizeHost = new URL(authorizeUrl).host;
    } catch {
      authorizeHost = "";
    }
    if (authorizeHost !== "slack.com") {
      console.error(`Slack broker returned unexpected authorizeUrl host: ${authorizeHost}`);
      return NextResponse.redirect(errorRedirect);
    }
    return NextResponse.redirect(authorizeUrl);
  } catch (e) {
    console.error("Slack broker /start error:", e);
    return NextResponse.redirect(errorRedirect);
  }
}
