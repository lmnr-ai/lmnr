import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

import { autoLinkSingleRepo, saveGithubInstallation } from "@/lib/actions/github";
import { getWorkspaceSettingsPath } from "@/lib/actions/projects";
import { getServerSession } from "@/lib/auth-session";
import { getWorkspaceRole } from "@/lib/authorization";
import { cache } from "@/lib/cache";
import { db } from "@/lib/db/drizzle";
import { githubIntegrations } from "@/lib/db/migrations/schema";
import { Feature, isFeatureEnabled } from "@/lib/features/features";
import { exchangeUserCode, findUserInstallation, INSTALLATION_REPOS_CACHE_KEY } from "@/lib/github/client";
import { consumeConnectState, verifyState } from "@/lib/github/state";
import { appUrl } from "@/lib/github/urls";

// GitHub redirects here after install (setup_action=install), after repo access changes on an
// existing install (update), or when a non-owner asked their org owner to approve (request).
export async function GET(request: NextRequest) {
  if (!isFeatureEnabled(Feature.GITHUB)) {
    return NextResponse.json({ error: "GitHub integration is not configured" }, { status: 404 });
  }

  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const installationId = Number(params.get("installation_id"));
  const setupAction = params.get("setup_action");
  const stateParam = params.get("state");

  // Repo access edited from GitHub's own settings page comes back without our state.
  if (!stateParam) {
    return NextResponse.redirect(await statelessReturnUrl(installationId));
  }

  const state = verifyState(stateParam);
  if (!state) {
    return NextResponse.redirect(appUrl("/projects", "error"));
  }
  const fail = (status: "error" | "taken" | "pending") => NextResponse.redirect(appUrl(state.returnTo, status));

  const session = await getServerSession();
  if (!session || session.user.id !== state.userId || !(await consumeConnectState(state))) {
    return fail("error");
  }

  // The later installation.created webhook doesn't say which Laminar workspace asked, so the
  // user reconnects once the org owner approves.
  if (setupAction === "request") {
    return fail("pending");
  }

  if (!code || !Number.isSafeInteger(installationId) || installationId <= 0) {
    return fail("error");
  }

  try {
    const role = await getWorkspaceRole(state.workspaceId, session.user.id);
    if (role !== "owner" && role !== "admin") {
      return fail("error");
    }

    // installation_id in this URL is user-controlled. Trust it only if GitHub lists it for this
    // user, or anyone could link another company's install and read their code.
    const userToken = await exchangeUserCode(code);
    const installation = await findUserInstallation(userToken, installationId);
    if (!installation) {
      return fail("error");
    }

    const result = await saveGithubInstallation({
      workspaceId: state.workspaceId,
      userId: session.user.id,
      installationId,
      account: installation.account,
    });
    if (result === "taken") {
      return fail("taken");
    }

    await cache.remove(INSTALLATION_REPOS_CACHE_KEY(installationId));
    await autoLinkSingleRepo(state.projectId).catch((e) => console.error("GitHub auto-link failed", e));
    return NextResponse.redirect(appUrl(state.returnTo, "connected"));
  } catch (e) {
    console.error("GitHub connect callback failed", e);
    return fail("error");
  }
}

// Only a path is revealed; the settings page itself enforces access.
async function statelessReturnUrl(installationId: number): Promise<string> {
  if (Number.isSafeInteger(installationId) && installationId > 0) {
    const [row] = await db
      .select({ workspaceId: githubIntegrations.workspaceId })
      .from(githubIntegrations)
      .where(eq(githubIntegrations.installationId, installationId))
      .limit(1);
    if (row) {
      await cache.remove(INSTALLATION_REPOS_CACHE_KEY(installationId));
      return appUrl(await getWorkspaceSettingsPath(row.workspaceId, "integrations"), "connected");
    }
  }
  return appUrl("/projects");
}
