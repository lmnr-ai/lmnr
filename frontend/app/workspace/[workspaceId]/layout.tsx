import { Metadata } from "next";
import { PropsWithChildren } from "react";

import SessionSyncProvider from "@/components/auth/session-sync-provider";
import { UserContextProvider } from "@/contexts/user-context";
import { requireWorkspaceAccess } from "@/lib/authorization";

export const metadata: Metadata = {
  title: "Workspace",
};

export default async function WorkspaceLayout(props: PropsWithChildren<{ params: Promise<{ workspaceId: string }> }>) {
  const params = await props.params;
  const session = await requireWorkspaceAccess(params.workspaceId);

  return (
    <UserContextProvider user={session.user}>
      <SessionSyncProvider>
        {props.children}
      </SessionSyncProvider>
    </UserContextProvider>
  );
}
