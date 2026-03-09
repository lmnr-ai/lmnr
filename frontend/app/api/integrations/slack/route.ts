import { type NextRequest, NextResponse } from "next/server";

import { connectSlackIntegration } from "@/lib/actions/slack";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const workspaceId = searchParams.get("state");
  const error = searchParams.get("error");

  if (error || !code || !workspaceId) {
    const redirectUrl = workspaceId
      ? `${process.env.NEXT_PUBLIC_URL}/workspace/${workspaceId}?tab=integrations&slack=error`
      : `${process.env.NEXT_PUBLIC_URL}/projects?slack=error`;
    return NextResponse.redirect(redirectUrl);
  }

  try {
    await connectSlackIntegration({ code, workspaceId });
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_URL}/workspace/${workspaceId}?tab=integrations`);
  } catch (e) {
    console.error(e);
    const redirectUrl = workspaceId
      ? `${process.env.NEXT_PUBLIC_URL}/workspace/${workspaceId}?tab=integrations&slack=error`
      : `${process.env.NEXT_PUBLIC_URL}/projects?slack=error`;
    return NextResponse.redirect(redirectUrl);
  }
}
