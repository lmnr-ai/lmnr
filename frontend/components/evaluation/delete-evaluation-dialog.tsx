import { Loader2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import React, { PropsWithChildren, useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/lib/hooks/use-toast";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";

const DeleteEvaluationDialog = ({ children }: PropsWithChildren) => {
  const { projectId, evaluationId } = useParams();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleDelete = useCallback(async () => {
    try {
      setIsLoading(true);

      const response = await fetch(`/api/projects/${projectId}/evaluations?evaluationIds=${evaluationId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        toast({
          title: "Error",
          description: "Failed to delete evaluation. Please try again.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Successfully deleted evaluation." });
        router.push(`/project/${projectId}/evaluations`);
      }
    } catch (e) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to delete evaluation. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setOpen(false);
    }
  }, [evaluationId, projectId, router, toast]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Evaluation</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete this evaluation? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button handleEnter variant="destructive" disabled={isLoading} onClick={handleDelete}>
            {isLoading && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DeleteEvaluationDialog;
