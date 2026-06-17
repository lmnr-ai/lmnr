import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useState } from "react";

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/lib/hooks/use-toast";
import { track } from "@/lib/posthog";
import { cn } from "@/lib/utils";
import { type Project } from "@/lib/workspaces/types";

import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

interface ProjectCreateDialogProps {
  workspaceId: string;
  onProjectCreate?: () => void;
  isFreeTier?: boolean;
  projectCount?: number;
  className?: string;
  // Optional custom trigger; defaults to a "Project" button when omitted.
  children?: ReactNode;
}

export default function ProjectCreateDialog({
  workspaceId,
  onProjectCreate,
  isFreeTier,
  projectCount,
  className,
  children,
}: ProjectCreateDialogProps) {
  const [newProjectName, setNewProjectName] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);

  const router = useRouter();
  const { toast } = useToast();

  const createNewProject = useCallback(async () => {
    setIsCreatingProject(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/projects`, {
        method: "POST",
        body: JSON.stringify({
          name: newProjectName,
        }),
      });

      if (!res.ok) {
        const error = (await res.json().catch(() => ({ error: "Failed to create project" }))) as { error: string };
        throw new Error(error?.error ?? "Failed to create project");
      }

      const newProject = (await res.json()) as Project;
      track("project", "created");
      onProjectCreate?.();
      router.push(`/project/${newProject.id}/traces`);
      setIsDialogOpen(false);
    } catch (e) {
      toast({
        title: "Error creating project",
        variant: "destructive",
        description: e instanceof Error ? e.message : "Failed to create project",
      });
    } finally {
      setIsCreatingProject(false);
    }
  }, [newProjectName, workspaceId, onProjectCreate, router, toast]);

  const hasReachedFreeLimit = isFreeTier && (projectCount ?? 0) >= 1;

  if (hasReachedFreeLimit) {
    return (
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0} className={cn("w-fit", className)} aria-disabled>
              {children ? (
                <span className="pointer-events-none opacity-50">{children}</span>
              ) : (
                <Button icon="plus" className={cn("w-fit", className)} disabled>
                  Project
                </Button>
              )}
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="flex flex-col gap-1 p-2">
            <p className="text-xs">Free plan is limited to 1 project per workspace.</p>
            {/* Uses the /workspace shim (not settingsHref) on purpose: this dialog also renders in
                the project-less /projects surface with no ProjectContext, where settingsHref would
                degrade to /projects. The shim resolves the prop workspace's billing settings. */}
            <Link href={`/workspace/${workspaceId}?tab=billing`} className="text-xs text-primary hover:underline">
              Upgrade to create more projects
            </Link>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Dialog
      open={isDialogOpen}
      onOpenChange={(open) => {
        setIsDialogOpen(open);
        setNewProjectName("");
      }}
    >
      <DialogTrigger asChild>
        {children ?? (
          <Button icon="plus" className={cn("w-fit", className)}>
            Project
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2">
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
