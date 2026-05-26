"use client";

import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/lib/hooks/use-toast";

interface ViewNameDialogProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  title: string;
  description?: string;
  initialName?: string;
  submitLabel?: string;
  onSave: (name: string) => Promise<{ ok: true } | { ok: false; message?: string }>;
}

export default function ViewNameDialog({
  open,
  onOpenChange,
  title,
  description,
  initialName = "",
  submitLabel = "Save",
  onSave,
}: ViewNameDialogProps) {
  const { toast } = useToast();
  const [name, setName] = useState(initialName);
  const [isSaving, setIsSaving] = useState(false);

  // Sync on open transitions only. Mid-edit initialName changes would clobber typing.
  useEffect(() => {
    if (open) {
      setName(initialName);
      setIsSaving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const trimmed = name.trim();
  const unchanged = trimmed === initialName.trim();
  const canSubmit = trimmed.length > 0 && !unchanged && !isSaving;

  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      if (!canSubmit) return;
      setIsSaving(true);
      try {
        const result = await onSave(trimmed);
        if (result.ok) {
          onOpenChange(false);
          return;
        }
        toast({ variant: "destructive", title: result.message ?? "Failed to save" });
      } finally {
        setIsSaving(false);
      }
    },
    [canSubmit, trimmed, onSave, onOpenChange, toast]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <Label htmlFor="view-name" className="text-xs text-muted-foreground">
              Name
            </Label>
            <Input
              id="view-name"
              autoFocus
              placeholder="e.g. Production traces"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {isSaving && <Loader2 className="mr-2 size-4 animate-spin" />}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
