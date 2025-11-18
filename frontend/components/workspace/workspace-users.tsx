"use client";

import { isEmpty } from "lodash";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import useSWR from "swr";

import { SettingsSection, SettingsSectionHeader } from "@/components/settings/settings-section";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import AddUserDialog from "@/components/workspace/add-user-dialog";
import InvitationsTable from "@/components/workspace/invitations-table";
import LeaveWorkspaceDialog from "@/components/workspace/leave-workspace-dialog";
import RemoveUserDialog from "@/components/workspace/remove-user-dialog";
import TransferOwnershipDialog from "@/components/workspace/ui/transfer-ownership-dialog.tsx";
import { useUserContext } from "@/contexts/user-context";
import { useToast } from "@/lib/hooks/use-toast";
import { WorkspaceStats } from "@/lib/usage/types";
import { formatTimestamp, swrFetcher } from "@/lib/utils";
import {
  WorkspaceInvitation,
  WorkspaceRole,
  WorkspaceTier,
  WorkspaceUser,
  WorkspaceWithOptionalUsers,
} from "@/lib/workspaces/types";

import { Button } from "../ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import PurchaseSeatsDialog from "./purchase-seats-dialog";

interface WorkspaceUsersProps {
  invitations: WorkspaceInvitation[];
  workspace: WorkspaceWithOptionalUsers;
  workspaceStats: WorkspaceStats;
  isOwner: boolean;
  currentUserRole: WorkspaceRole;
}

type DialogState = {
  type: "none" | "addUser" | "removeUser" | "leaveWorkspace" | "transferOwnership";
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

  const {
    data: users = [],
    mutate,
    isLoading,
  } = useSWR<WorkspaceUser[]>(`/api/workspaces/${workspace.id}/users`, swrFetcher);

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
        mutate();
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
    [workspace.id, toast, mutate, router]
  );

  const renderRoleCell = useCallback(
    (user: WorkspaceUser) => {
      if (canManageUsers && user.role !== "owner" && !isCurrentUser(user)) {
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
              <SelectItem value="member">member</SelectItem>
              <SelectItem value="admin">admin</SelectItem>
            </SelectContent>
          </Select>
        );
      }

      return <span className="text-sm">{user.role}</span>;
    },
    [canManageUsers, handleRoleChange, isCurrentUser, updatingRoleUserId]
  );

  const renderActionCell = useCallback(
    (user: WorkspaceUser) => {
      if (isOwner && !isCurrentUser(user)) {
        return (
          <TableCell>
            <Button onClick={() => openDialog("removeUser", user)} variant="outline">
              Remove
            </Button>
          </TableCell>
        );
      }

      if (currentUserRole === "admin" && user.role === "member") {
        return (
          <TableCell>
            <Button onClick={() => openDialog("removeUser", user)} variant="outline">
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
  if (isLoading) {
    return (
      <>
        <SettingsSectionHeader title="Members" description="Manage workspace members and their roles" />
        <SettingsSection>
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-8 w-40" />
              <Skeleton className="h-8 w-20" />
            </div>
            <div className="flex flex-col gap-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          </div>
        </SettingsSection>
      </>
    );
  }

  return (
    <>
      <SettingsSectionHeader title="Members" description="Manage workspace members and their roles" />
      {canManageUsers && (
        <SettingsSection>
          <SettingsSectionHeader
            size="sm"
            title="Workspace seats"
            description={`You have ${workspaceStats.membersLimit} seat${workspaceStats.membersLimit > 1 ? "s" : ""} in this workspace`}
          />
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
        </SettingsSection>
      )}
      <SettingsSection>
        <div className="flex items-center justify-between">
          <SettingsSectionHeader
            size="sm"
            title="Workspace members"
            description={`${users.length} member${users.length > 1 ? "s" : ""} in this workspace`}
          />
          {canManageUsers && (
            <AddUserDialog
              workspaceStats={workspaceStats}
              open={dialogState.type === "addUser"}
              onOpenChange={(open) => (open ? openDialog("addUser") : closeDialog())}
              workspace={workspace}
              usersCount={users.length}
            />
          )}
          {!isOwner && (
            <LeaveWorkspaceDialog
              user={users?.find(isCurrentUser)}
              workspace={workspace}
              open={dialogState.type === "leaveWorkspace"}
              onOpenChange={(open) => (open ? openDialog("leaveWorkspace") : closeDialog())}
            />
          )}
        </div>

        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="px-3">Email</TableHead>
                <TableHead className="px-3">Role</TableHead>
                <TableHead className="px-3">Added</TableHead>
                <TableHead className="px-3">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow className="border-b last:border-b-0 h-12" key={user.id}>
                  <TableCell className="font-medium px-3">{user.email}</TableCell>
                  <TableCell className="px-3">{renderRoleCell(user)}</TableCell>
                  <TableCell className="text-muted-foreground px-3">{formatTimestamp(user.createdAt)}</TableCell>
                  {renderActionCell(user)}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </SettingsSection>
      {isOwner && (
        <SettingsSection>
          <div className={"flex items-center justify-end"}>
            <TransferOwnershipDialog
              open={dialogState.type === "transferOwnership"}
              onOpenChange={(open) => (open ? openDialog("transferOwnership", dialogState.targetUser) : closeDialog())}
              workspace={workspace}
              workspaceUsers={users.filter((u) => u.role !== "owner" && u.role === "admin")}
            />
          </div>
        </SettingsSection>
      )}

      {canManageUsers && !isEmpty(invitations) && (
        <SettingsSection>
          <SettingsSectionHeader
            size="sm"
            title="Pending invitations"
            description={`${invitations.length} pending invitation${invitations.length > 1 ? "s" : ""}`}
          />
          <InvitationsTable workspaceId={workspace.id} invitations={invitations} />
        </SettingsSection>
      )}
      <RemoveUserDialog
        workspace={workspace}
        open={dialogState.type === "removeUser"}
        onOpenChange={(open) => (open ? openDialog("removeUser", dialogState.targetUser) : closeDialog())}
        user={dialogState.targetUser}
      />
    </>
  );
}
