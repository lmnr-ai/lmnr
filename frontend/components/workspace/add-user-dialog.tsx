import { Loader2, Plus, User } from "lucide-react";
import { useRouter } from "next/navigation";
import React, { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/lib/hooks/use-toast";
import { WorkspaceStats } from "@/lib/usage/types";
import { WorkspaceWithUsers } from "@/lib/workspaces/types";

interface AddUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace: WorkspaceWithUsers;
  workspaceStats: WorkspaceStats;
}

const AddUserDialog = ({ open, onOpenChange, workspace, workspaceStats }: AddUserDialogProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [user, setUser] = useState("");
  const { toast } = useToast();
  const showError = useCallback(
    (message: string) => {
      toast({
        title: "Error",
        variant: "destructive",
        description: message,
        duration: 10000,
      });
    },
    [toast]
  );

  const router = useRouter();
  const inviteUser = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/workspaces/${workspace.id}/invite`, {
        method: "POST",
        body: JSON.stringify({ email: user.trim() }),
      });

      if (!res.ok) {
        if (res.status === 400) {
          showError(await res.text());
        } else {
          showError(`Failed to add user`);
        }
        setIsLoading(false);
        return;
      }

      await res.text();
      onOpenChange(false);
      toast({ description: "Invitation sent successfully." });
      router.refresh();
    } catch (e) {
      showError(`Failed to add user`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        onOpenChange(open);
        setUser("");
      }}
    >
      {workspace.users.length >= workspaceStats.membersLimit ? (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button className="w-fit" variant="outline" disabled>
                <Plus className="w-4 h-4 mr-2 text-gray-500" />
                Invite member
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              You have reached the maximum number of users for this workspace.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        <DialogTrigger asChild>
          <Button
            disabled={workspace.users.length >= workspaceStats.membersLimit}
            onClick={() => onOpenChange(true)}
            variant="outline"
          >
            <Plus className="w-4 h-4 mr-2" />
            Invite member
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Invite a member to workspace</DialogTitle>
          <DialogDescription>This invitation will expire in 2 days.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col space-y-2">
          <Label>Email</Label>
          <div className="relative">
            <User className="w-4 h-4 absolute left-2.5 top-2.5" />
            <Input className="pl-8" autoFocus placeholder="Enter email" onChange={(e) => setUser(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={isLoading || user.trim() === ""}
            handleEnter={true}
            onClick={async () => {
              await inviteUser();
              onOpenChange(false);
              setUser("");
            }}
          >
            {isLoading && <Loader2 className="animate-spin h-4 w-4 mr-2" />}
            Invite
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddUserDialog;
