import { type NextRequest, NextResponse } from "next/server";

import { connectSlackIntegration } from "@/lib/actions/slack";

function parseState(state: string): { workspaceId: string; returnPath?: string } {
  const colonIdx = state.indexOf(":");
  if (colonIdx === -1) {
    return { workspaceId: state };
  }
  return {
    workspaceId: state.substring(0, colonIdx),
    returnPath: state.substring(colonIdx + 1),
  };
}

function buildRedirectUrl(workspaceId: string, returnPath?: string, error = false): string {
  const base = process.env.NEXT_PUBLIC_URL;

  if (returnPath) {
    const separator = returnPath.includes("?") ? "&" : "?";
    const status = error ? "slack=error" : "slack=success";
    return `${base}${returnPath}${separator}${status}`;
  }

  return error
    ? `${base}/workspace/${workspaceId}?tab=integrations&slack=error`
    : `${base}/workspace/${workspaceId}?tab=integrations&slack=success`;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const stateParam = searchParams.get("state");
  const error = searchParams.get("error");

  if (error || !code || !stateParam) {
    const parsed = stateParam ? parseState(stateParam) : null;
    return NextResponse.redirect(
      parsed
        ? buildRedirectUrl(parsed.workspaceId, parsed.returnPath, true)
        : `${process.env.NEXT_PUBLIC_URL}/projects?slack=error`
    );
  }

  const { workspaceId, returnPath } = parseState(stateParam);

  try {
    await connectSlackIntegration({ code, workspaceId });
    return NextResponse.redirect(buildRedirectUrl(workspaceId, returnPath));
  } catch (e) {
    console.error(e);
    return NextResponse.redirect(buildRedirectUrl(workspaceId, returnPath, true));
  }
}
