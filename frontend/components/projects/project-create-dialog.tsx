import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/lib/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Project } from "@/lib/workspaces/types";

import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

interface ProjectCreateDialogProps {
  workspaceId: string;
  onProjectCreate?: () => void;
}

export default function ProjectCreateDialog({ workspaceId, onProjectCreate }: ProjectCreateDialogProps) {
  const [newProjectName, setNewProjectName] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);

  const router = useRouter();
  const { toast } = useToast();

  const createNewProject = useCallback(async () => {
    setIsCreatingProject(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        body: JSON.stringify({
          name: newProjectName,
          workspaceId: workspaceId,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to create project");
      }

      const newProject = (await res.json()) as Project;
      onProjectCreate?.();
      router.push(`/project/${newProject.id}/traces`);
      setIsDialogOpen(false);
    } catch (e) {
      toast({
        title: "Error creating project",
        variant: "destructive",
        description: "Possible reason: you have reached the projects limit in this workspace.",
      });
    } finally {
      setIsCreatingProject(false);
    }
  }, [newProjectName, workspaceId, onProjectCreate, router, toast]);

  return (
    <Dialog
      open={isDialogOpen}
      onOpenChange={(open) => {
        setIsDialogOpen(open);
        setNewProjectName("");
      }}
    >
      <DialogTrigger asChild>
        <Button icon="plus" className="w-fit">
          Project
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <Label>Name</Label>
          <Input
            autoFocus
            placeholder="Name"
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button onClick={createNewProject} handleEnter={true} disabled={!newProjectName || isCreatingProject}>
            <Loader2
              className={cn("mr-2 hidden", {
                "animate-spin block": isCreatingProject,
              })}
              size={16}
            />
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
