import { and, eq } from "drizzle-orm";
import { type Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import TrialEndedActions from "@/components/trial-ended/trial-ended-actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { countWorkspaceMemberships } from "@/lib/actions/workspace/utils";
import { getServerSession } from "@/lib/auth-session";
import { db } from "@/lib/db/drizzle";
import { membersOfWorkspaces, users, workspaces } from "@/lib/db/migrations/schema";

export const metadata: Metadata = {
  title: "Workspace on Free plan - Laminar",
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Where requireWorkspaceAccess / requireProjectAccess send non-owners of a workspace that fell back to Free.
export default async function TrialEndedPage(props: { searchParams: Promise<{ workspaceId?: string }> }) {
  const { workspaceId } = await props.searchParams;
  if (!workspaceId || !UUID_REGEX.test(workspaceId)) {
    redirect("/projects");
  }

  const session = (await getServerSession())!;
  const membership = await db.query.membersOfWorkspaces.findFirst({
    where: and(eq(membersOfWorkspaces.workspaceId, workspaceId), eq(membersOfWorkspaces.userId, session.user.id)),
  });
  if (!membership) {
    notFound();
  }

  const [workspace, owners, openWorkspaceCount] = await Promise.all([
    db.query.workspaces.findFirst({ where: eq(workspaces.id, workspaceId), columns: { name: true } }),
    db
      .select({ name: users.name, email: users.email })
      .from(membersOfWorkspaces)
      .innerJoin(users, eq(users.id, membersOfWorkspaces.userId))
      .where(and(eq(membersOfWorkspaces.workspaceId, workspaceId), eq(membersOfWorkspaces.memberRole, "owner"))),
    countWorkspaceMemberships(session.user.id),
  ]);

  return (
    <div className="flex-1 flex items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{workspace?.name ?? "This workspace"} is on the Free plan</CardTitle>
          <CardDescription className="mt-1">
            Its trial or paid plan has ended, and the Free plan includes only the workspace owners. Ask an owner to
            upgrade to get access back.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {owners.length > 0 && (
            <div className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Owners</span>
              {owners.map((owner) => (
                <span key={owner.email}>
                  {owner.name} <span className="text-muted-foreground">({owner.email})</span>
                </span>
              ))}
            </div>
          )}
          <TrialEndedActions hasOpenWorkspace={openWorkspaceCount > 0} />
        </CardContent>
      </Card>
    </div>
  );
}
