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
import { type AlertWithDetails } from "@/lib/actions/alerts/types";
import { track } from "@/lib/analytics";
import { useToast } from "@/lib/hooks/use-toast";

interface DeleteAlertDialogProps {
  projectId: string;
  alert: AlertWithDetails | null;
  onClose: () => void;
  onDeleted: () => void;
}

export default function DeleteAlertDialog({ projectId, alert, onClose, onDeleted }: DeleteAlertDialogProps) {
  const { toast } = useToast();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = useCallback(async () => {
    if (!alert) return;

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/alerts`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertId: alert.id }),
      });

      if (!res.ok) {
        const error = (await res.json().catch(() => ({ error: "Failed to delete" }))) as { error: string };
        throw new Error(error?.error ?? "Failed to delete alert");
      }

      toast({ title: "Alert deleted", description: "You will no longer receive notifications for this alert." });
      track("alerts", "deleted");
      onDeleted();
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to delete alert. Please try again.",
      });
    } finally {
      setIsDeleting(false);
      onClose();
    }
  }, [alert, projectId, onDeleted, onClose, toast]);

  return (
    <Dialog
      open={!!alert}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete alert</DialogTitle>
          <DialogDescription>
            {alert
              ? `Are you sure you want to delete the alert "${alert.name}"? You will no longer receive notifications.`
              : ""}
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
