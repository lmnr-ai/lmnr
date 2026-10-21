"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/lib/hooks/use-toast";
import { cn } from "@/lib/utils";

interface RenameAgentDialogProps {
  projectId: string;
  agentId: string;
  currentName: string;
  onRenamed: () => void;
}

export default function RenameAgentDialog({ projectId, agentId, currentName, onRenamed }: RenameAgentDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const rename = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/agents/${agentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        toast({ variant: "destructive", title: "Failed to rename agent", description: body?.error });
        return;
      }
      onRenamed();
      setOpen(false);
    } catch {
      toast({ variant: "destructive", title: "Failed to rename agent", description: "Please try again." });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setName("");
      }}
    >
      <DialogTrigger asChild>
        <Button icon="edit" variant="outline" className="w-fit">
          Rename
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Rename agent</DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <Input autoFocus placeholder={currentName} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <DialogFooter>
          <Button disabled={!name.trim() || isLoading} onClick={rename} handleEnter={true}>
            <Loader2
              data-icon="inline-start"
              className={cn("mr-2 hidden", isLoading ? "animate-spin block" : "")}
              size={16}
            />
            Rename
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
