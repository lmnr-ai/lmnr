import { ArrowLeftRight, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import React, { useState } from "react";
import { useSWRConfig } from "swr";
import useSWRMutation from "swr/mutation";

import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox.tsx";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { useUserContext } from "@/contexts/user-context.tsx";
import { useToast } from "@/lib/hooks/use-toast";
import { cn } from "@/lib/utils";
import { type Workspace, type WorkspaceUser } from "@/lib/workspaces/types";

interface TransferOwnershipDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace: Workspace;
  workspaceUsers: WorkspaceUser[];
}

const transferOwnership = async (
  url: string,
  {
    arg: { workspaceId, currentOwnerId, newOwnerId },
  }: { arg: { workspaceId: string; currentOwnerId: string; newOwnerId: string } }
) => {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ workspaceId, currentOwnerId, newOwnerId }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Failed to transfer ownership");
  }
  return res.json();
};

const TransferOwnershipDialog = ({ open, onOpenChange, workspace, workspaceUsers }: TransferOwnershipDialogProps) => {
  const user = useUserContext();
  const [newOwner, setNewOwner] = useState<string | null>(null);
  const [workspaceNameInput, setWorkspaceNameInput] = useState<string>("");
  const { toast } = useToast();
  const { mutate } = useSWRConfig();
  const router = useRouter();
  const { trigger, isMutating } = useSWRMutation(
    `/api/workspaces/${workspace.id}/transfer-ownership`,
    transferOwnership,
    {
      onSuccess: () => {
        onOpenChange(false);
        toast({ description: "Ownership transferred successfully." });
        mutate(`/api/workspaces/${workspace.id}/users`);
        router.refresh();
      },
      onError: (error) => {
        toast({
          title: "Error",
          variant: "destructive",
          description: error instanceof Error ? error.message : "Failed to transfer ownership.",
        });
      },
    }
  );

  const isWorkspaceNameValid = workspaceNameInput === workspace.name;
  const isTransferEnabled = isWorkspaceNameValid && newOwner && !isMutating;

  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        onOpenChange(open);
        setNewOwner(null);
        setWorkspaceNameInput("");
      }}
    >
      <DialogTrigger asChild>
        <Button onClick={() => onOpenChange(true)} variant="warningOutline">
          <ArrowLeftRight className="w-4 h-4 mr-2" />
          Transfer ownership
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-amber-600 dark:text-amber-500">Transfer ownership</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This will transfer ownership of <span className="font-medium text-foreground">{workspace.name}</span> to
            another user. After the transfer, you will no longer be the owner and will have limited permissions. This
            action cannot be undone.
          </p>

          <div className="flex flex-col gap-2">
            <Label htmlFor="new-owner-select" className="text-secondary-foreground">
              Select new owner
            </Label>
            <Combobox
              items={workspaceUsers.map((u) => ({ value: u.email, label: u.name }))}
              value={newOwner}
              setValue={setNewOwner}
              placeholder="Choose an owner"
              noMatchText="No users found."
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="workspace-name-input" className="text-secondary-foreground">
              Type <span className="font-medium text-white">{workspace.name}</span> to confirm
            </Label>
            <div className="space-y-1">
              <Input
                id="workspace-name-input"
                autoFocus
                placeholder={workspace.name}
                value={workspaceNameInput}
                onChange={(e) => setWorkspaceNameInput(e.target.value)}
                className={cn(
                  !isWorkspaceNameValid && workspaceNameInput && "border-amber-500 focus-visible:ring-amber-500"
                )}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isMutating}>
            Cancel
          </Button>
          <Button
            disabled={!isTransferEnabled}
            onClick={() => {
              if (newOwner && isWorkspaceNameValid) {
                trigger({
                  workspaceId: workspace.id,
                  currentOwnerId: user.id,
                  newOwnerId: workspaceUsers.find((u) => u.email === newOwner)!.id,
                });
              }
            }}
            variant="warning"
          >
            <Loader2 className={cn("mr-2 h-4 w-4", isMutating ? "animate-spin" : "hidden")} />
            Transfer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TransferOwnershipDialog;
