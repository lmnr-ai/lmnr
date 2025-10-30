import { NextRequest, NextResponse } from "next/server";

import { connectSlackIntegration } from "@/lib/actions/slack";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const projectId = searchParams.get("state");
  const error = searchParams.get("error");

  if (error || !code || !projectId) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_URL}/project/${projectId}/settings?tab=integrations&slack=error`
    );
  }

  try {
    await connectSlackIntegration({ code, projectId });
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_URL}/project/${projectId}/settings?tab=integrations`);
  } catch (e) {
    console.error(e);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_URL}/project/${projectId}/settings?tab=integrations&slack=error`
    );
  }
}
