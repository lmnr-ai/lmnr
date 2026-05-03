import { type Metadata } from "next";
import { type PropsWithChildren } from "react";

import SessionSyncProvider from "@/components/auth/session-sync-provider";
import { UserContextProvider } from "@/contexts/user-context";
import { requireWorkspaceAccess } from "@/lib/authorization";
import { Feature, isFeatureEnabled } from "@/lib/features/features";
import PostHogClient from "@/lib/posthog/server";

export const metadata: Metadata = {
  title: "Workspace",
};

export default async function WorkspaceLayout(props: PropsWithChildren<{ params: Promise<{ workspaceId: string }> }>) {
  const params = await props.params;
  const session = await requireWorkspaceAccess(params.workspaceId);

  const posthog = PostHogClient();

  if (isFeatureEnabled(Feature.POSTHOG) && posthog && session.user.email) {
    posthog.identify({ distinctId: session.user.email });
  }

  return (
    <UserContextProvider user={session.user}>
      <SessionSyncProvider>{props.children}</SessionSyncProvider>
    </UserContextProvider>
  );
}
