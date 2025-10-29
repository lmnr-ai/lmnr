import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { connectSlackIntegration } from "@/lib/actions/slack";
import { authOptions } from "@/lib/auth.ts";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const projectId = searchParams.get("state");
  const error = searchParams.get("error");

  if (error || !code || !projectId) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_URL}/project/${projectId}/settings?slack=error`);
  }

  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_URL}/sign-in?callbackUrl=/project/${projectId}/settings`);
  }

  try {
    await connectSlackIntegration({ code, projectId });
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_URL}/project/${projectId}/settings?slack=success`);
  } catch (e) {
    console.error(e);
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_URL}/project/${projectId}/settings?slack=error`);
  }
}
