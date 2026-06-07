import { type NextRequest, NextResponse } from "next/server";

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
  if (!workspaceId) {
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
    return NextResponse.redirect(authorizeUrl);
  } catch (e) {
    console.error("Slack broker /start error:", e);
    return NextResponse.redirect(errorRedirect);
  }
}
