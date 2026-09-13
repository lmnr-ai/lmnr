"use client";

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
import { type LlmProfile } from "@/lib/actions/llm-profiles/schema";
import { useToast } from "@/lib/hooks/use-toast";

interface DeleteProfileDialogProps {
  workspaceId: string;
  profile: LlmProfile | null;
  onClose: () => void;
  onDeleted: () => void;
}

export default function DeleteProfileDialog({ workspaceId, profile, onClose, onDeleted }: DeleteProfileDialogProps) {
  const { toast } = useToast();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = useCallback(async () => {
    if (!profile) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/llm-profiles/${profile.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Failed to delete LLM profile");
      }
      toast({ title: "LLM profile deleted" });
      onDeleted();
    } catch (error) {
      toast({ variant: "destructive", title: error instanceof Error ? error.message : "Something went wrong" });
    } finally {
      setIsDeleting(false);
      onClose();
    }
  }, [profile, workspaceId, onDeleted, onClose, toast]);

  return (
    <Dialog open={!!profile} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete LLM profile</DialogTitle>
          <DialogDescription>
            {profile ? `Delete "${profile.name}"? Its credentials are removed permanently.` : ""}
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
