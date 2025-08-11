"use client";

import { Edit, Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useSWRConfig } from "swr";

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/lib/hooks/use-toast";
import { cn } from "@/lib/utils";
import { WorkspaceWithProjects, WorkspaceWithUsers } from "@/lib/workspaces/types";

import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

interface RenameWorkspaceForm {
  name: string;
}

interface DeleteWorkspaceForm {
  confirmationName: string;
}

interface WorkspaceSettingsProps {
  workspace: WorkspaceWithUsers;
  isOwner: boolean;
}

export default function WorkspaceSettings({ workspace, isOwner }: WorkspaceSettingsProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { mutate } = useSWRConfig();

  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const renameForm = useForm<RenameWorkspaceForm>({
    defaultValues: {
      name: "",
    },
    mode: "onChange",
  });

  const deleteForm = useForm<DeleteWorkspaceForm>({
    defaultValues: {
      confirmationName: "",
    },
    mode: "onChange",
  });

  const renameWorkspace = renameForm.handleSubmit(async (data) => {
    try {
      const res = await fetch(`/api/workspaces/${workspace.id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: data.name,
        }),
      });

      if (res.ok) {
        await mutate<WorkspaceWithProjects[]>(
          "/api/workspaces",
          (currentData) => currentData?.map((ws) => (ws.id === workspace.id ? { ...ws, name: data.name } : ws)),
          { revalidate: false, populateCache: true, rollbackOnError: true }
        );

        toast({
          title: "Workspace Renamed",
          description: "Workspace renamed successfully!",
        });
        router.refresh();
        setIsRenameDialogOpen(false);
        renameForm.reset();
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
  });

  const deleteWorkspace = deleteForm.handleSubmit(async (data) => {
    try {
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

      await mutate<WorkspaceWithProjects[]>(
        "/api/workspaces",
        (currentData) => currentData?.filter((ws) => ws.id !== workspace.id),
        { revalidate: false, populateCache: true, rollbackOnError: true }
      );

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
    }
  });

  const resetAndCloseDeleteDialog = useCallback(
    (open: boolean) => {
      setIsDeleteDialogOpen(open);
      if (!open) {
        deleteForm.reset();
      }
    },
    [deleteForm]
  );

  const resetAndCloseRenameDialog = useCallback(
    (open: boolean) => {
      setIsRenameDialogOpen(open);
      if (!open) {
        renameForm.reset();
      }
    },
    [renameForm]
  );

  const isDeleteEnabled = deleteForm.formState.isValid && !deleteForm.formState.isSubmitting;

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
            <form onSubmit={renameWorkspace} className="space-y-4">
              <div className="grid gap-4 py-4">
                <Label>Enter new workspace name</Label>
                <Controller
                  name="name"
                  control={renameForm.control}
                  rules={{
                    required: "Workspace name is required",
                    validate: (value) => value.trim().length > 0 || "Workspace name cannot be empty",
                  }}
                  render={({ field, fieldState }) => (
                    <div className="space-y-1">
                      <Input
                        {...field}
                        autoFocus
                        placeholder={workspace.name}
                        className={cn(fieldState.error && "border-destructive focus-visible:ring-destructive")}
                      />
                      {fieldState.error && <p className="text-xs text-destructive">{fieldState.error.message}</p>}
                    </div>
                  )}
                />
              </div>
              <DialogFooter>
                <Button
                  type="submit"
                  disabled={!renameForm.formState.isValid || renameForm.formState.isSubmitting}
                  handleEnter={true}
                >
                  <Loader2
                    className={cn("mr-2 h-4 w-4", renameForm.formState.isSubmitting ? "animate-spin" : "hidden")}
                  />
                  Rename
                </Button>
              </DialogFooter>
            </form>
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
            <form onSubmit={deleteWorkspace} className="space-y-4">
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
                  <Controller
                    name="confirmationName"
                    control={deleteForm.control}
                    rules={{
                      required: "Please enter the workspace name to confirm",
                      validate: (value) => value === workspace.name || "Workspace name does not match",
                    }}
                    render={({ field, fieldState }) => (
                      <div className="space-y-1">
                        <Input
                          {...field}
                          id="workspace-name-input"
                          autoFocus
                          placeholder={workspace.name}
                          className={cn(fieldState.error && "border-destructive focus-visible:ring-destructive")}
                        />
                        {fieldState.error && <p className="text-xs text-destructive">{fieldState.error.message}</p>}
                      </div>
                    )}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => resetAndCloseDeleteDialog(false)}
                  disabled={deleteForm.formState.isSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="destructive" disabled={!isDeleteEnabled}>
                  <Loader2
                    className={cn("mr-2 h-4 w-4", deleteForm.formState.isSubmitting ? "animate-spin" : "hidden")}
                  />
                  Delete
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
