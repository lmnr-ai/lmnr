"use client";

import { Edit, Loader2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useProjectContext } from "@/contexts/project-context";
import { useToast } from "@/lib/hooks/use-toast";
import { cn } from "@/lib/utils";

import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

interface RenameProjectProps {}

export default function RenameProject({}: RenameProjectProps) {
  const { project } = useProjectContext();
  const { projectId } = useParams();
  const router = useRouter();

  const [newProjectName, setNewProjectName] = useState<string>("");
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const { toast } = useToast();

  const renameProject = async () => {
    setIsLoading(true);

    const res = await fetch(`/api/projects/${projectId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: newProjectName,
      }),
    });

    if (res.ok) {
      toast({
        title: "Project Renamed",
        description: `Project renamed successfully!.`,
      });
      router.refresh();
      setIsRenameDialogOpen(false);
    } else {
      toast({
        title: "Error",
        description: "Something went wrong. Please try again later.",
      });
    }

    setIsLoading(false);
  };

  return (
    <div className="rounded-lg border">
      <div className="p-6 space-y-4">
        <div className="space-y-2">
          <h3 className="text-base font-semibold">Rename project</h3>
          <p className="text-sm text-muted-foreground">
            Update the name of your project. Changes will take effect immediately.
          </p>
        </div>
        <Dialog
          open={isRenameDialogOpen}
          onOpenChange={() => {
            setIsRenameDialogOpen(!isRenameDialogOpen);
            setNewProjectName("");
          }}
        >
          <DialogTrigger asChild>
            <Button
              onClick={() => {
                setIsRenameDialogOpen(true);
              }}
              variant="outline"
              className="h-9"
            >
              <Edit className="w-4 h-4 mr-2" />
              Rename project
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Rename project</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <Label>Enter new project name</Label>
              <Input
                autoFocus
                placeholder={project?.name}
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button disabled={!newProjectName.trim() || isLoading} onClick={renameProject} handleEnter={true}>
                <Loader2 className={cn("mr-2 hidden", isLoading ? "animate-spin block" : "")} size={16} />
                Rename
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
