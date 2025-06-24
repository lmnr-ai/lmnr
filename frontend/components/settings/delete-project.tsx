"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useProjectContext } from "@/contexts/project-context";
import { useToast } from "@/lib/hooks/use-toast";
import { cn } from "@/lib/utils";

import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

export default function DeleteProject() {
  const { projectId, projectName } = useProjectContext();
  const router = useRouter();
  const { toast } = useToast();

  const [inputProjectName, setInputProjectName] = useState<string>("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const deleteProject = useCallback(async () => {
    if (inputProjectName !== projectName) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Project name does not match",
      });
      return;
    }

    try {
      setIsLoading(true);

      const res = await fetch(`/api/projects/${projectId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const errorText = await res.text();
        toast({
          variant: "destructive",
          title: "Error",
          description: errorText || "Failed to delete the project",
        });
        return;
      }

      toast({
        title: "Project deleted successfully",
        description: "Redirecting to projects page...",
      });

      router.push("/projects");
    } catch (error) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete the project. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  }, [inputProjectName, projectName, toast, projectId, router]);

  const resetAndClose = useCallback((open: boolean) => {
    setIsDialogOpen(open);
    setInputProjectName("");
  }, []);

  const isDeleteEnabled = inputProjectName === projectName && !isLoading;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">Delete project</h2>
        <p className="text-sm text-muted-foreground">
          Permanently delete this project and all of its data. This action cannot be undone.
        </p>
      </div>
      <Dialog open={isDialogOpen} onOpenChange={resetAndClose}>
        <DialogTrigger asChild>
          <Button
            onClick={() => setIsDialogOpen(true)}
            variant="outline"
            className="h-8 text-destructive border-destructive"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete project
          </Button>
        </DialogTrigger>

        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive">Delete project</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This will permanently delete <span className="font-medium text-foreground">{projectName}</span> and all of
              its data. This action cannot be undone.
            </p>

            <div className="space-y-2">
              <Label htmlFor="project-name-input" className="text-secondary-foreground">
                Type <span className="font-medium text-white">{projectName}</span> to confirm
              </Label>
              <Input
                id="project-name-input"
                autoFocus
                placeholder={projectName}
                value={inputProjectName}
                onChange={(e) => setInputProjectName(e.target.value)}
                className={cn(
                  inputProjectName &&
                    inputProjectName !== projectName &&
                    "border-destructive focus-visible:ring-destructive"
                )}
              />
              {inputProjectName && inputProjectName !== projectName && (
                <p className="text-xs text-destructive">Project name does not match</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => resetAndClose(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={!isDeleteEnabled} onClick={deleteProject}>
              <Loader2 className={cn("mr-2 h-4 w-4", isLoading ? "animate-spin" : "hidden")} />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
