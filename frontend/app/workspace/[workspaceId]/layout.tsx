import { type Metadata } from "next";
import { type PropsWithChildren } from "react";

import SessionSyncProvider from "@/components/auth/session-sync-provider";
import WorkspaceGroupTracker from "@/components/common/workspace-group-tracker";
import { UserContextProvider } from "@/contexts/user-context";
import { getWorkspaceInfo } from "@/lib/actions/workspace";
import { requireWorkspaceAccess } from "@/lib/authorization";
import { Feature, isFeatureEnabled } from "@/lib/features/features";
import PostHogClient from "@/lib/posthog/server";

export const metadata: Metadata = {
  title: "Workspace",
};

export default async function WorkspaceLayout(props: PropsWithChildren<{ params: Promise<{ workspaceId: string }> }>) {
  const params = await props.params;
  const session = await requireWorkspaceAccess(params.workspaceId);
  const workspace = await getWorkspaceInfo(params.workspaceId);

  const posthog = PostHogClient();

  if (isFeatureEnabled(Feature.POSTHOG) && posthog && session.user.email) {
    posthog.identify({ distinctId: session.user.email });
  }

  return (
    <UserContextProvider user={session.user}>
      <SessionSyncProvider>
        <WorkspaceGroupTracker workspaceId={workspace.id} workspaceName={workspace.name} />
        {props.children}
      </SessionSyncProvider>
    </UserContextProvider>
  );
}
