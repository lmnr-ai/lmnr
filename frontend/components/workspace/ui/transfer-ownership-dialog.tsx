import { CircleAlert, Loader2 } from "lucide-react";
import React, { useState } from "react";
import { useSWRConfig } from "swr";
import useSWRMutation from "swr/mutation";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label.tsx";
import { useToast } from "@/lib/hooks/use-toast";
import { Workspace, WorkspaceUser } from "@/lib/workspaces/types";

interface TransferOwnershipDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace: Workspace;
  workspaceUsers: WorkspaceUser[];
}

const transferOwnership = async (url: string, { arg: newOwnerEmail }: { arg: string }) => {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ newOwnerEmail }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Failed to transfer ownership");
  }
  return res.json();
};

const TransferOwnershipDialog = ({ open, onOpenChange, workspace, workspaceUsers }: TransferOwnershipDialogProps) => {
  const [newOwner, setNewOwner] = useState<string | null>(null);
  const { toast } = useToast();
  const { mutate } = useSWRConfig();
  const { trigger, isMutating } = useSWRMutation(
    `/api/workspaces/${workspace.id}/transfer-ownership`,
    transferOwnership,
    {
      onSuccess: () => {
        onOpenChange(false);
        toast({ description: "Ownership transferred successfully." });
        mutate(`/api/workspaces/${workspace.id}/users`);
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

  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        onOpenChange(open);
        setNewOwner(null);
      }}
    >
      <DialogTrigger asChild>
        <Button className={""} onClick={() => onOpenChange(true)} variant="destructiveOutline">
          Transfer ownership
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Transfer ownership</DialogTitle>
          <DialogDescription>Transfer this workspace to another user.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col space-y-2">
          <Label>New owner</Label>
          <Combobox
            items={workspaceUsers.map((user) => ({ value: user.email, label: user.name }))}
            value={newOwner}
            setValue={setNewOwner}
            placeholder={"Choose an owner"}
            noFoundText={"No users found."}
          />
        </div>
        <Alert variant="destructive">
          <div className="flex items-start gap-4">
            <CircleAlert className="w-4 h-4" />
            <div className="flex-1 space-y-1">
              <AlertTitle>Warning</AlertTitle>
              <AlertDescription>This is a potentially destructive action.</AlertDescription>
            </div>
          </div>
        </Alert>
        <DialogFooter>
          <Button
            disabled={!newOwner}
            handleEnter={true}
            onClick={() => {
              if (newOwner) {
                trigger(newOwner);
              }
            }}
            variant="destructive"
          >
            {isMutating && <Loader2 className="animate-spin h-4 w-4 mr-2" />}I understand, transfer this ownership
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TransferOwnershipDialog;
