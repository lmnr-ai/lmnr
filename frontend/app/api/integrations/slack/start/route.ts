import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";

import { buildSlackAuthorizeUrl } from "@/lib/actions/slack/broker";
import { mintSlackOauthState } from "@/lib/actions/slack/oauth-state";
import { getServerSession } from "@/lib/auth-session";
import { isUserMemberOfWorkspace } from "@/lib/authorization";
import { BASE_PATH } from "@/lib/utils";

// Direct (Cloud) Slack connect entrypoint. The connect button links the browser
// here instead of straight to slack.com, so the workspace is authorized and bound
// into a server-side, single-use state record (with a PKCE verifier) before the
// browser ever reaches Slack. The callback trusts only that record.
export async function GET(request: NextRequest): Promise<Response> {
  const workspaceId = request.nextUrl.searchParams.get("workspaceId");
  const returnPath = request.nextUrl.searchParams.get("returnPath");
  const redirectUri = process.env.SLACK_REDIRECT_URL;

  const errorUrl = `${new URL(process.env.NEXT_PUBLIC_URL ?? request.nextUrl.origin).origin}${BASE_PATH}/projects?slack=error`;

  if (!redirectUri || !process.env.SLACK_CLIENT_ID) {
    console.error("Slack connect attempted without SLACK_CLIENT_ID / SLACK_REDIRECT_URL");
    return NextResponse.redirect(errorUrl);
  }
  if (workspaceId === null || !z.guid().safeParse(workspaceId).success) {
    return NextResponse.redirect(errorUrl);
  }

  const session = await getServerSession();
  if (!session || !(await isUserMemberOfWorkspace(workspaceId, session.user.id))) {
    return NextResponse.redirect(errorUrl);
  }

  const { state, codeChallenge } = await mintSlackOauthState({
    userId: session.user.id,
    workspaceId,
    returnPath: returnPath ?? undefined,
  });
  return NextResponse.redirect(buildSlackAuthorizeUrl(state, codeChallenge, redirectUri));
}
