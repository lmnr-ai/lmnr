"use client";

import { Loader2 } from "lucide-react";
import { type PropsWithChildren, useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/lib/hooks/use-toast";
import { cn } from "@/lib/utils";

export interface CreatedProject {
  id: string;
  name: string;
  workspaceId: string;
}

interface AddProjectDialogProps {
  workspaceId: string;
  onCreated: (project: CreatedProject) => void;
}

export function AddProjectDialog({ workspaceId, onCreated, children }: PropsWithChildren<AddProjectDialogProps>) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const submit = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/projects`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        toast({ variant: "destructive", title: err?.error ?? "Failed to create project" });
        return;
      }
      const project = (await res.json()) as { id: string; name: string; workspaceId: string };
      onCreated(project);
      setOpen(false);
    } catch {
      toast({ variant: "destructive", title: "Network error" });
    } finally {
      setSubmitting(false);
    }
  }, [name, onCreated, toast, workspaceId]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setName("");
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-96">
        <DialogHeader>
          <DialogTitle>Add project</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2">
          <Label>Name</Label>
          <Input autoFocus placeholder="my-project" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <DialogFooter>
          <Button className="w-fit" onClick={submit} disabled={!name.trim() || submitting} handleEnter>
            <Loader2 className={cn("mr-2 hidden", submitting && "block animate-spin")} size={16} />
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
