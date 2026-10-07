import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";

import { getWorkspaceSettingsPath } from "@/lib/actions/projects";
import { getServerSession } from "@/lib/auth-session";
import { isUserMemberOfWorkspace } from "@/lib/authorization";
import { BASE_PATH } from "@/lib/utils";

// Brokered (self-hosted) Slack connect entrypoint. The connect button links the
// browser here; this route calls the Laminar Cloud broker's /start with the
// instance's license key (server-to-server, key never enters the browser), then
// 302s the browser to the Slack authorize URL the broker returns.
//
// The returnUrl we hand the broker points back at this instance's callback with
// the workspaceId embedded, since the broker echoes only claim + team info on
// the way back — the instance must carry its own workspace context.
export async function GET(request: NextRequest): Promise<Response> {
  const brokerUrl = process.env.SLACK_BROKER_URL;
  const licenseKey = process.env.LMNR_LICENSE_KEY;
  const baseUrl = process.env.NEXT_PUBLIC_URL;

  const workspaceId = request.nextUrl.searchParams.get("workspaceId");
  const returnPath = request.nextUrl.searchParams.get("returnPath");

  // Fall back to the request origin so a missing NEXT_PUBLIC_URL still yields a
  // valid absolute redirect target (NextResponse.redirect rejects a malformed
  // `undefined/...` URL) rather than throwing from the misconfiguration path.
  // Append BASE_PATH (sub-path deploys): NextResponse.redirect is not auto-prefixed
  // by Next, and the returnPath/settings paths below are prefix-free. Strip to
  // .origin first so an env URL that already carries the sub-path doesn't double it.
  const errorBase = `${new URL(baseUrl ?? request.nextUrl.origin).origin}${BASE_PATH}`;
  // Settings live at /project/[id]/settings — prefer the caller's returnPath, else resolve the
  // workspace's project, else fall back to /projects (workspaceId may be missing/invalid here).
  const buildErrorRedirect = async (): Promise<string> => {
    if (returnPath && returnPath.startsWith("/") && !returnPath.startsWith("//")) {
      const sep = returnPath.includes("?") ? "&" : "?";
      return `${errorBase}${returnPath}${sep}slack=error`;
    }
    if (workspaceId && z.guid().safeParse(workspaceId).success) {
      const settingsPath = await getWorkspaceSettingsPath(workspaceId, "integrations");
      const sep = settingsPath.includes("?") ? "&" : "?";
      return `${errorBase}${settingsPath}${sep}slack=error`;
    }
    return `${errorBase}/projects?slack=error`;
  };

  if (!brokerUrl || !licenseKey || !baseUrl) {
    console.error("Slack broker connect attempted without SLACK_BROKER_URL / LMNR_LICENSE_KEY / NEXT_PUBLIC_URL");
    return NextResponse.redirect(await buildErrorRedirect());
  }
  // Validate workspaceId as a UUID up front (matching the direct OAuth path's
  // z.guid()) so a malformed id fails fast here instead of embedding garbage in
  // the broker returnUrl and bouncing off the broker's own z.guid() with a 400.
  if (workspaceId === null || !z.guid().safeParse(workspaceId).success) {
    return NextResponse.redirect(await buildErrorRedirect());
  }

  // This route is browser-facing (the connect button links the browser here), so
  // the session cookie is present. Require a signed-in user who belongs to the
  // workspace before driving broker state creation and Slack authorization —
  // otherwise anyone who can hit this URL could complete a Slack install for a
  // workspace they don't belong to, mirroring the gate the callback enforces
  // before redeeming the resulting claim.
  const session = await getServerSession();
  if (!session || !(await isUserMemberOfWorkspace(workspaceId, session.user.id))) {
    return NextResponse.redirect(await buildErrorRedirect());
  }

  // The route is mounted under BASE_PATH (Next prefixes API route mounting), so the
  // returnUrl the broker redirects the browser back to must include the sub-path.
  const callback = new URL(`${new URL(baseUrl).origin}${BASE_PATH}/api/integrations/slack`);
  callback.searchParams.set("workspaceId", workspaceId);
  if (returnPath) {
    callback.searchParams.set("returnPath", returnPath);
  }

  try {
    const response = await fetch(`${brokerUrl.replace(/\/+$/, "")}/api/broker/slack/start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${licenseKey}`,
      },
      body: JSON.stringify({ workspaceId, returnUrl: callback.toString() }),
    });

    if (!response.ok) {
      console.error(`Slack broker /start failed with status ${response.status}`);
      return NextResponse.redirect(await buildErrorRedirect());
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
      return NextResponse.redirect(await buildErrorRedirect());
    }
    return NextResponse.redirect(authorizeUrl);
  } catch (e) {
    console.error("Slack broker /start error:", e);
    return NextResponse.redirect(await buildErrorRedirect());
  }
}
