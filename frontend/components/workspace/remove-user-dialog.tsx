import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

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

interface RemoveUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace: Workspace;
  user?: WorkspaceUser;
}

const RemoveUserDialog = ({ open, onOpenChange, workspace, user }: RemoveUserDialogProps) => {
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
            description: "Failed to remove user. Please try again.",
          });
        } else {
          onOpenChange(false);
          router.refresh();
          toast({ variant: "default", description: "User removed successfully." });
        }
      } catch (e) {
        toast({ variant: "destructive", title: "Error", description: "Failed to remove user. Please try again." });
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle title="Remove User">Remove user</DialogTitle>
          <DialogDescription>
            Are you sure you want to remove {user?.name} ({user?.email}) from workspace?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={isLoading} variant="destructive" onClick={handleRemoveUser}>
            {isLoading && <Loader2 className="animate-spin h-4 w-4 mr-2" />}
            Remove
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RemoveUserDialog;
