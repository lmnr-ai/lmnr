"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface CreateGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Existing group names — a match is blocked (create-new must be a fresh name). */
  existingNames: string[];
  count: number;
  isMoving: boolean;
  onConfirm: (groupId: string) => void;
}

export default function CreateGroupDialog({
  open,
  onOpenChange,
  existingNames,
  count,
  isMoving,
  onConfirm,
}: CreateGroupDialogProps) {
  const [name, setName] = useState("");

  const trimmed = name.trim();
  const isDuplicate = trimmed.length > 0 && existingNames.includes(trimmed);
  const invalid = trimmed.length === 0 || isDuplicate;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setName("");
      }}
    >
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>New group</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2">
          <Label>Name</Label>
          <Input autoFocus placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          {isDuplicate && (
            <span className="text-xs text-destructive">A group named &quot;{trimmed}&quot; already exists.</span>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isMoving}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm(trimmed)} handleEnter disabled={invalid || isMoving}>
            <Loader2 className={cn("mr-2 hidden", { "animate-spin block": isMoving })} size={16} />
            Create and move {count} eval run{count === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
