import { type NextRequest, NextResponse } from "next/server";

import {
  consumeState,
  exchangeSlackCode,
  getBrokerRedirectUri,
  mintClaim,
  verifyState,
} from "@/lib/actions/slack/broker";

function buildInstanceRedirect(returnUrl: string, params: Record<string, string>): string {
  const url = new URL(returnUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

// Slack's registered redirect target (browser-facing). Verifies the signed
// state, exchanges the code for a bot token, mints a one-time claim code, and
// 302s the browser back to the originating instance with only the claim + team
// display name. The bot token never appears in this browser-visible URL.
export async function GET(request: NextRequest): Promise<Response> {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const stateParam = searchParams.get("state");
  const slackError = searchParams.get("error");

  const state = stateParam ? verifyState(stateParam) : null;

  // Without a valid state we have no trusted instance URL to return to.
  if (!state) {
    return NextResponse.json({ error: "Invalid or expired state" }, { status: 400 });
  }

  // Bail on a callback that carries no usable code BEFORE consuming the nonce.
  // Consuming first would let anyone who learns the state (e.g. from the
  // authorize URL) fire a code-less /cb to burn the single-use record, so the
  // victim's real code+state callback then fails. The state is verified here,
  // so we have a trusted returnUrl to send the error back to.
  if (slackError || !code) {
    return NextResponse.redirect(buildInstanceRedirect(state.returnUrl, { slack: "error" }));
  }

  // Single-use: consume the server-side record minted with this state. A replay
  // (e.g. a leaked state paired with an attacker's OAuth code) finds the record
  // already gone and is rejected before any code exchange or claim mint. The
  // record also carries the PKCE verifier needed to redeem the code below.
  // A benign double-callback (back/refresh) lands here too: redirect to the
  // instance with slack=error rather than stranding the user on a raw broker
  // JSON page. No token/claim is minted.
  const consumed = await consumeState(state);
  if (!consumed) {
    return NextResponse.redirect(buildInstanceRedirect(state.returnUrl, { slack: "error" }));
  }

  try {
    const { token, teamId, teamName } = await exchangeSlackCode({
      code,
      redirectUri: getBrokerRedirectUri(),
      codeVerifier: consumed.codeVerifier,
    });

    const claim = await mintClaim({ token, teamId, teamName, instanceId: state.instanceId });

    return NextResponse.redirect(
      buildInstanceRedirect(state.returnUrl, {
        slack: "success",
        claim,
        team: teamName ?? "",
        teamId,
      })
    );
  } catch (error) {
    console.error("Slack broker /cb error:", error);
    return NextResponse.redirect(buildInstanceRedirect(state.returnUrl, { slack: "error" }));
  }
}
