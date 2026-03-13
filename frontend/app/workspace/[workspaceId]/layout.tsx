import { type Metadata } from "next";
import { notFound } from "next/navigation";
import { type PropsWithChildren } from "react";

import SessionSyncProvider from "@/components/auth/session-sync-provider";
import { UserContextProvider } from "@/contexts/user-context";
import { requireWorkspaceAccess } from "@/lib/authorization";

export const metadata: Metadata = {
  title: "Workspace",
};

export default async function WorkspaceLayout(props: PropsWithChildren<{ params: Promise<{ workspaceId: string }> }>) {
  const params = await props.params;

  let session;
  try {
    session = await requireWorkspaceAccess(params.workspaceId);
  } catch (e) {
    // Re-throw Next.js navigation errors (redirect, notFound)
    if (e && typeof e === "object" && "digest" in e) throw e;
    return notFound();
  }

  return (
    <UserContextProvider user={session.user}>
      <SessionSyncProvider>{props.children}</SessionSyncProvider>
    </UserContextProvider>
  );
}
