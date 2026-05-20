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

interface SaveViewDialogProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  onSave: (name: string) => Promise<{ ok: true } | { ok: false; conflict: boolean; message?: string }>;
}

export default function SaveViewDialog({ open, onOpenChange, onSave }: SaveViewDialogProps) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [conflict, setConflict] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setName("");
      setConflict(false);
      setIsSaving(false);
    }
  }, [open]);

  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      const trimmed = name.trim();
      if (!trimmed) return;
      setIsSaving(true);
      setConflict(false);
      try {
        const result = await onSave(trimmed);
        if (result.ok) {
          onOpenChange(false);
          return;
        }
        if (result.conflict) {
          setConflict(true);
        } else {
          toast({
            variant: "destructive",
            title: result.message ?? "Failed to save view",
          });
        }
      } finally {
        setIsSaving(false);
      }
    },
    [name, onSave, onOpenChange, toast]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Save view</DialogTitle>
            <DialogDescription>Share these table settings with the project as a named view.</DialogDescription>
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
              onChange={(e) => {
                setName(e.target.value);
                if (conflict) setConflict(false);
              }}
              maxLength={120}
            />
            {conflict && <p className="text-xs text-destructive">A view with this name already exists</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving || !name.trim()}>
              {isSaving && <Loader2 className="mr-2 size-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
