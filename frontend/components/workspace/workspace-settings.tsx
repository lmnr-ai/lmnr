"use client";

import { Edit, Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/lib/hooks/use-toast";
import { cn } from "@/lib/utils";
import { WorkspaceWithUsers } from "@/lib/workspaces/types";

import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

interface WorkspaceSettingsProps {
  workspace: WorkspaceWithUsers;
  isOwner: boolean;
}

export default function WorkspaceSettings({ workspace, isOwner }: WorkspaceSettingsProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [newWorkspaceName, setNewWorkspaceName] = useState<string>("");
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [isRenameLoading, setIsRenameLoading] = useState<boolean>(false);

  const [inputWorkspaceName, setInputWorkspaceName] = useState<string>("");
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleteLoading, setIsDeleteLoading] = useState<boolean>(false);

  const renameWorkspace = async () => {
    setIsRenameLoading(true);

    try {
      const res = await fetch(`/api/workspaces/${workspace.id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: newWorkspaceName,
        }),
      });

      if (res.ok) {
        toast({
          title: "Workspace Renamed",
          description: "Workspace renamed successfully!",
        });
        router.refresh();
        setIsRenameDialogOpen(false);
        setNewWorkspaceName("");
      } else {
        const errorData = await res.json();
        toast({
          variant: "destructive",
          title: "Error",
          description: errorData.error || "Something went wrong. Please try again later.",
        });
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Something went wrong. Please try again later.",
      });
    }

    setIsRenameLoading(false);
  };

  const deleteWorkspace = useCallback(async () => {
    if (inputWorkspaceName !== workspace.name) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Workspace name does not match",
      });
      return;
    }

    try {
      setIsDeleteLoading(true);

      const res = await fetch(`/api/workspaces/${workspace.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const errorData = await res.json();
        toast({
          variant: "destructive",
          title: "Error",
          description: errorData.error || "Failed to delete the workspace",
        });
        return;
      }

      toast({
        title: "Workspace deleted successfully",
        description: "Redirecting to workspaces page...",
      });

      router.push("/projects");
    } catch (error) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete the workspace. Please try again.",
      });
    } finally {
      setIsDeleteLoading(false);
    }
  }, [inputWorkspaceName, workspace.name, workspace.id, toast, router]);

  const resetAndCloseDeleteDialog = useCallback((open: boolean) => {
    setIsDeleteDialogOpen(open);
    setInputWorkspaceName("");
  }, []);

  const resetAndCloseRenameDialog = useCallback((open: boolean) => {
    setIsRenameDialogOpen(open);
    setNewWorkspaceName("");
  }, []);

  const isDeleteEnabled = inputWorkspaceName === workspace.name && !isDeleteLoading;

  if (!isOwner) {
    return (
      <div className="p-4">
        <p className="text-muted-foreground">Only workspace owners can access workspace settings.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col space-y-8 p-4">
      <div className="flex flex-col items-start space-y-4">
        <h1 className="text-lg">Rename workspace</h1>
        <Label className="text-sm text-secondary-foreground">
          Update the name of your workspace. Changes will take effect immediately.
        </Label>
        <Dialog open={isRenameDialogOpen} onOpenChange={resetAndCloseRenameDialog}>
          <DialogTrigger asChild>
            <Button
              disabled={!isOwner}
              onClick={() => setIsRenameDialogOpen(true)}
              variant="outline"
              className="h-8 max-w-80"
            >
              <Edit className="w-4 mr-1" />
              Rename workspace
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Rename workspace</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <Label>Enter new workspace name</Label>
              <Input
                autoFocus
                placeholder={workspace.name}
                value={newWorkspaceName}
                onChange={(e) => setNewWorkspaceName(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button
                disabled={!newWorkspaceName.trim() || isRenameLoading}
                onClick={renameWorkspace}
                handleEnter={true}
              >
                <Loader2 className={cn("mr-2 hidden", isRenameLoading ? "animate-spin block" : "")} size={16} />
                Rename
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">Delete workspace</h2>
          <p className="text-sm text-muted-foreground">
            Permanently delete this workspace and all of its data, including all projects. This action cannot be undone.
          </p>
        </div>
        <Dialog open={isDeleteDialogOpen} onOpenChange={resetAndCloseDeleteDialog}>
          <DialogTrigger asChild>
            <Button
              disabled={!isOwner}
              onClick={() => setIsDeleteDialogOpen(true)}
              variant="outline"
              className="h-8 text-destructive border-destructive"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete workspace
            </Button>
          </DialogTrigger>

          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-destructive">Delete workspace</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                This will permanently delete <span className="font-medium text-foreground">{workspace.name}</span> and
                all of its data, including all projects and their associated traces, evaluations, and datasets. This
                action cannot be undone.
              </p>

              <div className="space-y-2">
                <Label htmlFor="workspace-name-input" className="text-secondary-foreground">
                  Type <span className="font-medium text-white">{workspace.name}</span> to confirm
                </Label>
                <Input
                  id="workspace-name-input"
                  autoFocus
                  placeholder={workspace.name}
                  value={inputWorkspaceName}
                  onChange={(e) => setInputWorkspaceName(e.target.value)}
                  className={cn(
                    inputWorkspaceName &&
                      inputWorkspaceName !== workspace.name &&
                      "border-destructive focus-visible:ring-destructive"
                  )}
                />
                {inputWorkspaceName && inputWorkspaceName !== workspace.name && (
                  <p className="text-xs text-destructive">Workspace name does not match</p>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => resetAndCloseDeleteDialog(false)} disabled={isDeleteLoading}>
                Cancel
              </Button>
              <Button variant="destructive" disabled={!isDeleteEnabled} onClick={deleteWorkspace}>
                <Loader2 className={cn("mr-2 h-4 w-4", isDeleteLoading ? "animate-spin" : "hidden")} />
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
