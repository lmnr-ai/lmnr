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
    <UserContextProvider
      id={session.user.id}
      email={session.user.email!}
      supabaseAccessToken={session.supabaseAccessToken}
      username={session.user.name!}
      imageUrl={session.user.image!}
    >
      <SessionSyncProvider>
        {props.children}
      </SessionSyncProvider>
    </UserContextProvider>
  );
}
