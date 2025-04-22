"use client";

import { isEmpty } from "lodash";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import { Label } from "@/components/ui/label";
import AddUserDialog from "@/components/workspace/add-user-dialog";
import InvitationsTable from "@/components/workspace/invitations-table";
import LeaveWorkspaceDialog from "@/components/workspace/leave-workspace-dialog";
import RemoveUserDialog from "@/components/workspace/remove-user-dialog";
import { useUserContext } from "@/contexts/user-context";
import { WorkspaceStats } from "@/lib/usage/types";
import { formatTimestamp } from "@/lib/utils";
import { WorkspaceInvitation, WorkspaceUser, WorkspaceWithUsers } from "@/lib/workspaces/types";

import { Button } from "../ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import PurchaseSeatsDialog from "./purchase-seats-dialog";

interface WorkspaceUsersProps {
  invitations: WorkspaceInvitation[];
  workspace: WorkspaceWithUsers;
  workspaceStats: WorkspaceStats;
  isOwner: boolean;
}

export default function WorkspaceUsers({ invitations, workspace, workspaceStats, isOwner }: WorkspaceUsersProps) {
  const { email } = useUserContext();
  const [isAddUserDialogOpen, setIsAddUserDialogOpen] = useState(false);
  const [isRemoveUserDialogOpen, setIsRemoveUserDialogOpen] = useState(false);
  const [isLeaveWorkspaceDialogOpen, setIsLeaveWorkspaceDialogOpen] = useState(false);

  const [targetUser, setTargetUser] = useState<WorkspaceUser | undefined>(undefined);
  const handleRemoveUser = useCallback((user: WorkspaceUser) => {
    setTargetUser(user);
    setIsRemoveUserDialogOpen(true);
  }, []);

  const router = useRouter();

  const isDeletable = useMemo(() => isOwner && workspace.users?.length > 1, [isOwner, workspace.users?.length]);

  const hasLeavePermission = useMemo(() => !isOwner && workspace.users?.length > 1, [isOwner, workspace.users?.length]);

  return (
    <div className="p-4">
      <div className="flex flex-col items-start gap-4 w-2/3">
        <div className="flex flex-row w-full gap-4">
          {isOwner && (
            <div className="flex flex-col gap-4">
              <Label>
                You have {workspaceStats.membersLimit} seat{workspaceStats.membersLimit > 1 ? "s" : ""} in this
                workspace
              </Label>
              {workspace.tierName.trim().toLowerCase() === "pro" && (
                <PurchaseSeatsDialog
                  workspaceId={workspace.id}
                  currentQuantity={workspaceStats.membersLimit}
                  seatsIncludedInTier={workspaceStats.seatsIncludedInTier}
                  onUpdate={() => {
                    router.refresh();
                  }}
                />
              )}
              <AddUserDialog
                workspaceStats={workspaceStats}
                open={isAddUserDialogOpen}
                onOpenChange={setIsAddUserDialogOpen}
                workspace={workspace}
              />
            </div>
          )}
          {!isOwner && (
            <LeaveWorkspaceDialog
              user={workspace.users?.find((user) => user.email === email)}
              workspace={workspace}
              open={isLeaveWorkspaceDialogOpen}
              onOpenChange={setIsLeaveWorkspaceDialogOpen}
            />
          )}
        </div>
        <Table>
          <TableHeader>
            <TableRow className="border-none bg-card text-card-foreground rounded-lg overflow-hidden">
              <TableHead className="p-2">Email</TableHead>
              <TableHead className="p-2">Role</TableHead>
              <TableHead className="p-2">Added</TableHead>
              {isDeletable && <TableHead className="p-2" />}
              {hasLeavePermission && <TableHead className="p-2" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {workspace.users.map((user, i) => (
              <TableRow key={user.id} className="h-14">
                <TableCell>{user.email}</TableCell>
                <TableCell>{user.role}</TableCell>
                <TableCell>{formatTimestamp(user.createdAt)}</TableCell>
                {isDeletable && email !== user.email && (
                  <TableCell align="center">
                    <Button onClick={() => handleRemoveUser(user)} variant="destructive" className="mx-auto">
                      Remove
                    </Button>
                  </TableCell>
                )}
                {hasLeavePermission && email === user.email && (
                  <TableCell align="center">
                    <Button onClick={() => setIsLeaveWorkspaceDialogOpen(true)} variant="outline" className="ml-auto">
                      Leave workspace
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {isOwner && !isEmpty(invitations) && <InvitationsTable workspaceId={workspace.id} invitations={invitations} />}
      </div>
      <RemoveUserDialog
        workspace={workspace}
        onOpenChange={setIsRemoveUserDialogOpen}
        open={isRemoveUserDialogOpen}
        user={targetUser}
      />
    </div>
  );
}
