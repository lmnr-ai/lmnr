import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";

import { getWorkspaceSettingsPath } from "@/lib/actions/projects";
import { getSlackIntegration, requestBrokerAuthorizeUrl } from "@/lib/actions/slack";
import {
  buildSlackOidcAuthorizeUrl,
  mintSlackLinkState,
  SLACK_LINK_STATE_PARAM_PREFIX,
} from "@/lib/actions/slack/user-links";
import { getServerSession } from "@/lib/auth-session";
import { isUserMemberOfWorkspace } from "@/lib/authorization";
import { getBrokerLicenseKey } from "@/lib/license";
import { BASE_PATH } from "@/lib/utils";

// Starts Sign in with Slack so the signed-in user can see the private channels they share with the
// bot. Browser-facing: the link state is bound to the session user, and the callback
// (/api/integrations/slack) only links the account of the user who started the flow. Brokered
// (self-hosted) mode takes precedence, as in the install flow.
export async function GET(request: NextRequest): Promise<Response> {
  const baseUrl = process.env.NEXT_PUBLIC_URL;
  const workspaceId = request.nextUrl.searchParams.get("workspaceId");
  const returnPath = request.nextUrl.searchParams.get("returnPath");
  const safeReturnPath = returnPath && returnPath.startsWith("/") && !returnPath.startsWith("//") ? returnPath : null;

  const base = `${new URL(baseUrl ?? request.nextUrl.origin).origin}${BASE_PATH}`;
  const errorRedirect = async (): Promise<Response> => {
    const path =
      safeReturnPath ??
      (workspaceId && z.guid().safeParse(workspaceId).success
        ? await getWorkspaceSettingsPath(workspaceId, "integrations")
        : "/projects");
    return NextResponse.redirect(`${base}${path}${path.includes("?") ? "&" : "?"}slack=error`);
  };

  if (workspaceId === null || !z.guid().safeParse(workspaceId).success) {
    return errorRedirect();
  }

  const session = await getServerSession();
  if (!session || !(await isUserMemberOfWorkspace(workspaceId, session.user.id))) {
    return errorRedirect();
  }

  const integration = await getSlackIntegration(workspaceId);
  if (!integration) {
    return errorRedirect();
  }

  try {
    const linkState = await mintSlackLinkState({
      userId: session.user.id,
      workspaceId,
      ...(safeReturnPath && { returnPath: safeReturnPath }),
    });

    if (process.env.SLACK_BROKER_URL && (await getBrokerLicenseKey())) {
      if (!baseUrl) {
        return errorRedirect();
      }
      const callback = new URL(`${new URL(baseUrl).origin}${BASE_PATH}/api/integrations/slack`);
      callback.searchParams.set("workspaceId", workspaceId);
      callback.searchParams.set("linkState", linkState.id);
      if (safeReturnPath) {
        callback.searchParams.set("returnPath", safeReturnPath);
      }
      return NextResponse.redirect(
        await requestBrokerAuthorizeUrl({
          workspaceId,
          returnUrl: callback.toString(),
          kind: "link",
          teamId: integration.teamId,
        })
      );
    }

    const redirectUri = process.env.SLACK_REDIRECT_URL;
    if (!redirectUri) {
      return errorRedirect();
    }
    return NextResponse.redirect(
      buildSlackOidcAuthorizeUrl({
        state: `${SLACK_LINK_STATE_PARAM_PREFIX}${linkState.id}`,
        nonce: linkState.oidcNonce,
        redirectUri,
        teamId: integration.teamId,
      })
    );
  } catch (e) {
    console.error("Slack account link start error:", e);
    return errorRedirect();
  }
}
