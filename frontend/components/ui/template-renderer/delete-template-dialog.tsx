import { Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useSWRConfig } from "swr";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/lib/hooks/use-toast";
import { cn } from "@/lib/utils";

interface DeleteTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: { id: string; name: string };
  /** Fired after a successful delete so the caller can reset its form/state. */
  onDeleted?: (templateId: string) => void;
}

const DeleteTemplateDialog = ({ open, onOpenChange, template, onDeleted }: DeleteTemplateDialogProps) => {
  const { projectId } = useParams();
  const { toast } = useToast();
  const { mutate } = useSWRConfig();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      const res = await fetch(`/api/projects/${projectId}/render-templates/${template.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const errMessage = await res
          .json()
          .then((d) => d?.error)
          .catch(() => null);
        toast({
          variant: "destructive",
          title: "Error",
          description: errMessage ?? "Failed to delete template",
        });
        return;
      }

      await mutate(`/api/projects/${projectId}/render-templates`, (prev: { id: string }[] | undefined) =>
        prev?.filter((t) => t.id !== template.id)
      );
      onDeleted?.(template.id);
      toast({ title: "Template deleted" });
      onOpenChange(false);
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to delete template",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !isDeleting && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-destructive">Delete template</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          This will permanently delete <span className="font-medium text-foreground">{template.name}</span>. This action
          cannot be undone.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isDeleting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
            <Loader2 className={cn("mr-2 size-4", isDeleting ? "animate-spin" : "hidden")} />
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DeleteTemplateDialog;
