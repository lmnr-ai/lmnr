import { useParams } from "next/navigation";
import { useCallback, useState } from "react";

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

interface TemplateInfo {
  id: string;
  name: string;
}

interface Props {
  template: TemplateInfo | null;
  onClose: () => void;
  onDeleted: () => void;
}

export default function DeleteRenderTemplateDialog({ template, onClose, onDeleted }: Props) {
  const { projectId } = useParams();
  const { toast } = useToast();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = useCallback(async () => {
    if (!template) return;

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/render-templates/${template.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? "Failed to delete template");
      }

      toast({ title: "Template deleted" });
      onDeleted();
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to delete template",
      });
    } finally {
      setIsDeleting(false);
      onClose();
    }
  }, [template, projectId, onDeleted, onClose, toast]);

  return (
    <Dialog
      open={!!template}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete template</DialogTitle>
          <DialogDescription>
            {template ? `Are you sure you want to delete "${template.name}"? This cannot be undone.` : ""}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isDeleting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
            {isDeleting ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
