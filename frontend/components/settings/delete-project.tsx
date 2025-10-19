"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useProjectContext } from "@/contexts/project-context";
import { useToast } from "@/lib/hooks/use-toast";
import { cn } from "@/lib/utils";

import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { SettingsSection, SettingsSectionHeader } from "./settings-section";

export default function DeleteProject() {
  const { project } = useProjectContext();
  const { projectId } = useParams();
  const router = useRouter();
  const { toast } = useToast();

  const [inputProjectName, setInputProjectName] = useState<string>("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const deleteProject = useCallback(async () => {
    if (inputProjectName !== project?.name) {
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
  }, [inputProjectName, project?.name, toast, projectId, router]);

  const resetAndClose = useCallback((open: boolean) => {
    setIsDialogOpen(open);
    setInputProjectName("");
  }, []);

  const isDeleteEnabled = inputProjectName === project?.name && !isLoading;

  return (
    <SettingsSection>
      <SettingsSectionHeader
        size="sm"
        title="Delete project"
        description="Permanently delete this project and all of its data. This action cannot be undone."
      />
      <Dialog open={isDialogOpen} onOpenChange={resetAndClose}>
        <DialogTrigger asChild>
          <Button
            onClick={() => setIsDialogOpen(true)}
            variant="outline"
            className="h-9 w-fit text-destructive border-destructive"
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
              This will permanently delete <span className="font-medium text-foreground">{project?.name}</span> and all
              of its data. This action cannot be undone.
            </p>

            <div className="space-y-2">
              <Label htmlFor="project-name-input" className="text-secondary-foreground">
                Type <span className="font-medium text-white">{project?.name}</span> to confirm
              </Label>
              <Input
                id="project-name-input"
                autoFocus
                placeholder={project?.name}
                value={inputProjectName}
                onChange={(e) => setInputProjectName(e.target.value)}
                className={cn(
                  inputProjectName &&
                    inputProjectName !== project?.name &&
                    "border-destructive focus-visible:ring-destructive"
                )}
              />
              {inputProjectName && inputProjectName !== project?.name && (
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
    </SettingsSection>
  );
}
