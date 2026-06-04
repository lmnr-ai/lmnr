import { type Metadata } from "next";
import { getServerSession } from "next-auth";

import { OAuthDeviceClient } from "@/components/oauth-device";
import { OAuthDeviceCodeInput } from "@/components/oauth-device/code-input";
import { OAuthDevicePanel } from "@/components/oauth-device/panel";
import { authOptions } from "@/lib/auth";
import { isUserMemberOfProject } from "@/lib/authorization";
import { getDeviceCodeByUserCode } from "@/lib/oauth/device-codes";
import { listAccessibleWorkspaces } from "@/lib/oauth/user-access";

export const metadata: Metadata = {
  title: "Authorize device — Laminar",
};

interface OAuthDevicePageProps {
  searchParams?: Promise<{ user_code?: string }>;
}

export default async function OAuthDevicePage(props: OAuthDevicePageProps) {
  const params = await props.searchParams;
  const rawCode = params?.user_code?.trim().toUpperCase();
  const userCode = rawCode ? normalizeUserCode(rawCode) : null;

  // Unauthenticated users are redirected to `/sign-in?callbackUrl=...` by
  // `proxy.ts` (matcher includes `/oauth/device`) and `(auth)/layout.tsx`
  // (defense-in-depth via `x-pathname` forwarded by proxy.ts). By the time the
  // page runs, the session is guaranteed.
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    // Should be unreachable; render the unauthenticated panel as a safety net.
    return (
      <OAuthDevicePanel title="Authorize device">
        <p className="text-sm text-secondary-foreground">Please sign in to continue.</p>
      </OAuthDevicePanel>
    );
  }
  const user = session.user;

  if (!userCode) {
    return (
      <OAuthDevicePanel title="Authorize device">
        <p className="text-sm text-secondary-foreground">Enter the code shown in your terminal to authorize the CLI.</p>
        <OAuthDeviceCodeInput />
      </OAuthDevicePanel>
    );
  }

  const row = await getDeviceCodeByUserCode(userCode);
  if (!row) {
    return (
      <OAuthDevicePanel title="Code not found">
        <p className="text-sm text-secondary-foreground">
          We could not find a device code matching <span className="font-mono">{userCode}</span>. Double-check the code
          from your terminal and try again.
        </p>
      </OAuthDevicePanel>
    );
  }

  if (row.status !== "pending") {
    const message =
      row.status === "approved"
        ? "This code was already approved. Return to your terminal."
        : row.status === "denied"
          ? "This code was denied. Run the CLI command again to restart."
          : row.status === "claimed"
            ? "This code was already used. Run the CLI command again to restart."
            : "This code is no longer valid. Run the CLI command again to restart.";
    return (
      <OAuthDevicePanel title="Code unavailable">
        <p className="text-sm text-secondary-foreground">{message}</p>
      </OAuthDevicePanel>
    );
  }

  const now = nowMs();
  if (new Date(row.expiresAt).getTime() < now) {
    return (
      <OAuthDevicePanel title="Code expired">
        <p className="text-sm text-secondary-foreground">
          This code has expired. Run the CLI command again to start a new login.
        </p>
      </OAuthDevicePanel>
    );
  }

  const workspaces = await listAccessibleWorkspaces(user.id);

  // Pre-validate requested project access if a project hint was passed.
  let requestedProjectAccessible = false;
  if (row.requestedProjectId) {
    requestedProjectAccessible = await isUserMemberOfProject(row.requestedProjectId, user.id);
  }

  return (
    <OAuthDeviceClient
      userCode={row.userCode}
      clientId={row.clientId}
      scope={row.scope}
      requestedProjectId={row.requestedProjectId}
      requestedProjectAccessible={requestedProjectAccessible}
      workspaces={workspaces}
      userEmail={user.email ?? ""}
    />
  );
}

function nowMs(): number {
  return Date.now();
}

function normalizeUserCode(raw: string): string {
  const stripped = raw.replace(/[^A-Z0-9]/g, "");
  if (stripped.length !== 8) return raw;
  return `${stripped.slice(0, 4)}-${stripped.slice(4)}`;
}
