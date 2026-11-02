import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";

import { connectSlackIntegration, redeemBrokeredSlackToken } from "@/lib/actions/slack";
import {
  authorizeSlackCallbackWorkspace,
  buildRedirectUrl,
  parseState,
  prefixedBase,
} from "@/lib/actions/slack/callback";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const stateParam = searchParams.get("state");
  const error = searchParams.get("error");

  // Brokered (self-hosted) path: the broker's /cb redirected here with the
  // workspaceId/returnPath this instance embedded in the returnUrl at /start,
  // plus either a one-time claim (success) or slack=error (failed/replayed
  // OAuth — no claim). The direct-OAuth path carries its context in `state` and
  // never sets a workspaceId query param, so its presence reliably marks the
  // brokered callback and ensures the error case also lands on the workspace
  // integrations page rather than falling through to the /projects fallback.
  const brokeredWorkspaceId = searchParams.get("workspaceId");
  if (brokeredWorkspaceId !== null) {
    const returnPath = searchParams.get("returnPath") ?? undefined;
    const claim = searchParams.get("claim");
    const slackStatus = searchParams.get("slack");
    if (slackStatus === "error" || !brokeredWorkspaceId || !claim || !z.guid().safeParse(brokeredWorkspaceId).success) {
      return NextResponse.redirect(await buildRedirectUrl(brokeredWorkspaceId, returnPath, true));
    }

    const auth = await authorizeSlackCallbackWorkspace(brokeredWorkspaceId);
    if (!auth.authorized) {
      return NextResponse.redirect(await buildRedirectUrl(brokeredWorkspaceId, returnPath, true));
    }

    try {
      await redeemBrokeredSlackToken({ claim, workspaceId: brokeredWorkspaceId });
      return NextResponse.redirect(await buildRedirectUrl(brokeredWorkspaceId, returnPath));
    } catch (e) {
      console.error(e);
      return NextResponse.redirect(await buildRedirectUrl(brokeredWorkspaceId, returnPath, true));
    }
  }

  if (error || !code || !stateParam) {
    const parsed = stateParam ? parseState(stateParam) : null;
    return NextResponse.redirect(
      parsed
        ? await buildRedirectUrl(parsed.workspaceId, parsed.returnPath, true)
        : `${prefixedBase()}/projects?slack=error`
    );
  }

  const { workspaceId, returnPath } = parseState(stateParam);

  const auth = await authorizeSlackCallbackWorkspace(workspaceId);
  if (!auth.authorized) {
    return NextResponse.redirect(await buildRedirectUrl(workspaceId, returnPath, true));
  }

  try {
    await connectSlackIntegration({ code, workspaceId });
    return NextResponse.redirect(await buildRedirectUrl(workspaceId, returnPath));
  } catch (e) {
    console.error(e);
    return NextResponse.redirect(await buildRedirectUrl(workspaceId, returnPath, true));
  }
}
