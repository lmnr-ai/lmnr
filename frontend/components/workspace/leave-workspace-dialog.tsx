import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import React, { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/lib/hooks/use-toast";
import { Workspace, WorkspaceUser } from "@/lib/workspaces/types";

interface LeaveWorkspaceDialog {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace: Workspace;
  user?: WorkspaceUser;
}

const LeaveWorkspaceDialog = ({ open, onOpenChange, workspace, user }: LeaveWorkspaceDialog) => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const handleRemoveUser = async () => {
    if (user) {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/workspaces/${workspace.id}/remove-user?id=${user.id}`, {
          method: "DELETE",
        });

        if (!res.ok) {
          toast({
            title: "Error",
            variant: "destructive",
            description: "Failed to leave workspace. Please try again.",
          });
        } else {
          onOpenChange(false);
          router.push("/projects");
          toast({ variant: "default", description: "Workspace left successfully." });
        }
      } catch (e) {
        toast({ variant: "destructive", title: "Error", description: "Failed to leave workspace. Please try again." });
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle title="Leave workspace">Leave workspace</DialogTitle>
          <DialogDescription>Are you sure you want to leave this workspace?</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={isLoading} variant="destructive" onClick={handleRemoveUser}>
            {isLoading && <Loader2 className="animate-spin h-4 w-4 mr-2" />}
            Leave
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default LeaveWorkspaceDialog;
