"use client";

import { isEmpty } from "lodash";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import AddUserDialog from "@/components/workspace/add-user-dialog";
import InvitationsTable from "@/components/workspace/invitations-table";
import LeaveWorkspaceDialog from "@/components/workspace/leave-workspace-dialog";
import RemoveUserDialog from "@/components/workspace/remove-user-dialog";
import { useUserContext } from "@/contexts/user-context";
import { useToast } from "@/lib/hooks/use-toast";
import { WorkspaceStats } from "@/lib/usage/types";
import { formatTimestamp } from "@/lib/utils";
import {
  WorkspaceInvitation,
  WorkspaceRole,
  WorkspaceTier,
  WorkspaceUser,
  WorkspaceWithUsers,
} from "@/lib/workspaces/types";

import { Button } from "../ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import PurchaseSeatsDialog from "./purchase-seats-dialog";

interface WorkspaceUsersProps {
  invitations: WorkspaceInvitation[];
  workspace: WorkspaceWithUsers;
  workspaceStats: WorkspaceStats;
  isOwner: boolean;
  currentUserRole: WorkspaceRole;
}

type DialogState = {
  type: "none" | "addUser" | "removeUser" | "leaveWorkspace";
  targetUser?: WorkspaceUser;
};

export default function WorkspaceUsers({
  invitations,
  workspace,
  workspaceStats,
  isOwner,
  currentUserRole,
}: WorkspaceUsersProps) {
  const { email } = useUserContext();
  const { toast } = useToast();
  const router = useRouter();

  const [dialogState, setDialogState] = useState<DialogState>({ type: "none" });
  const [updatingRoleUserId, setUpdatingRoleUserId] = useState<string | null>(null);

  const canManageUsers = currentUserRole === "owner" || currentUserRole === "admin";

  const isCurrentUser = useCallback((user: WorkspaceUser) => user.email === email, [email]);
  const openDialog = useCallback((type: DialogState["type"], targetUser?: WorkspaceUser) => {
    setDialogState({ type, targetUser });
  }, []);

  const closeDialog = useCallback(() => {
    setDialogState({ type: "none" });
  }, []);

  const handleRoleChange = useCallback(
    async (userId: string, role: WorkspaceRole) => {
      setUpdatingRoleUserId(userId);
      try {
        const response = await fetch(`/api/workspaces/${workspace.id}/update-user-role`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ userId, role }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Failed to update role");
        }

        toast({
          title: "Role updated successfully",
        });
        router.refresh();
      } catch (error) {
        toast({
          title: error instanceof Error ? error.message : "Failed to update role",
          variant: "destructive",
        });
      } finally {
        setUpdatingRoleUserId(null);
      }
    },
    [workspace.id, toast, router]
  );

  const renderRoleCell = useCallback(
    (user: WorkspaceUser) => {
      if (isOwner && user.role !== "owner" && !isCurrentUser(user)) {
        return (
          <Select
            value={user.role}
            onValueChange={(newRole: WorkspaceRole) => handleRoleChange(user.id, newRole)}
            disabled={updatingRoleUserId === user.id}
          >
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="member">Member</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
        );
      }

      return <span className="text-sm">{user.role}</span>;
    },
    [handleRoleChange, isCurrentUser, isOwner, updatingRoleUserId]
  );

  const renderActionCell = useCallback(
    (user: WorkspaceUser) => {
      if (isOwner && !isCurrentUser(user)) {
        return (
          <TableCell align="center">
            <Button onClick={() => openDialog("removeUser", user)} variant="destructive">
              Remove
            </Button>
          </TableCell>
        );
      }

      if (currentUserRole === "admin" && user.role === "member") {
        return (
          <TableCell align="center">
            <Button onClick={() => openDialog("removeUser", user)} variant="destructive">
              Remove
            </Button>
          </TableCell>
        );
      }

      if (!isOwner && isCurrentUser(user)) {
        return (
          <TableCell>
            <Button onClick={() => openDialog("leaveWorkspace")} variant="outline">
              Leave workspace
            </Button>
          </TableCell>
        );
      }

      return <TableCell />;
    },
    [currentUserRole, isCurrentUser, isOwner, openDialog]
  );

  return (
    <div className="p-4">
      <div className="flex flex-col items-start gap-4 w-2/3">
        <div className="flex flex-row w-full gap-4">
          {canManageUsers && (
            <div className="flex flex-col gap-4">
              {isOwner && (
                <>
                  <Label>
                    You have {workspaceStats.membersLimit} seat{workspaceStats.membersLimit > 1 ? "s" : ""} in this
                    workspace
                  </Label>
                  {workspace.tierName === WorkspaceTier.PRO && (
                    <PurchaseSeatsDialog
                      workspaceId={workspace.id}
                      currentQuantity={workspaceStats.membersLimit}
                      seatsIncludedInTier={workspaceStats.seatsIncludedInTier}
                      onUpdate={() => {
                        router.refresh();
                      }}
                    />
                  )}
                </>
              )}
              <AddUserDialog
                workspaceStats={workspaceStats}
                open={dialogState.type === "addUser"}
                onOpenChange={(open) => (open ? openDialog("addUser") : closeDialog())}
                workspace={workspace}
              />
            </div>
          )}

          {!isOwner && (
            <LeaveWorkspaceDialog
              user={workspace.users?.find(isCurrentUser)}
              workspace={workspace}
              open={dialogState.type === "leaveWorkspace"}
              onOpenChange={(open) => (open ? openDialog("leaveWorkspace") : closeDialog())}
            />
          )}
        </div>

        <Table>
          <TableHeader>
            <TableRow className="border-none bg-card text-card-foreground rounded-lg overflow-hidden">
              <TableHead className="p-2">Email</TableHead>
              <TableHead className="p-2">Role</TableHead>
              <TableHead className="p-2">Added</TableHead>
              <TableHead className="p-2">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {workspace.users.map((user, i) => (
              <TableRow key={user.id} className="h-14">
                <TableCell>{user.email}</TableCell>
                <TableCell>{renderRoleCell(user)}</TableCell>
                <TableCell>{formatTimestamp(user.createdAt)}</TableCell>
                {renderActionCell(user)}
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {canManageUsers && !isEmpty(invitations) && (
          <InvitationsTable workspaceId={workspace.id} invitations={invitations} />
        )}
      </div>

      <RemoveUserDialog
        workspace={workspace}
        open={dialogState.type === "removeUser"}
        onOpenChange={(open) => (open ? openDialog("removeUser", dialogState.targetUser) : closeDialog())}
        user={dialogState.targetUser}
      />
    </div>
  );
}
