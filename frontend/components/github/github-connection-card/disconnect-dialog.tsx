"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";

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
import { track } from "@/lib/posthog";

interface DisconnectDialogProps {
  workspaceId: string;
  accountLogin: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDisconnected: () => void;
}

export default function DisconnectDialog({
  workspaceId,
  accountLogin,
  open,
  onOpenChange,
  onDisconnected,
}: DisconnectDialogProps) {
  const { toast } = useToast();
  const [isRemoving, setIsRemoving] = useState(false);

  const handleDisconnect = async () => {
    setIsRemoving(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/github`, { method: "DELETE" });
      if (!res.ok) {
        const error = await res
          .json()
          .then((d) => d?.error)
          .catch(() => null);
        toast({ variant: "destructive", title: error ?? "Failed to disconnect GitHub" });
        return;
      }
      track("integrations", "github_disconnected");
      toast({ title: "GitHub disconnected" });
      onDisconnected();
      onOpenChange(false);
    } catch {
      toast({ variant: "destructive", title: "Failed to disconnect GitHub" });
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Disconnect GitHub</DialogTitle>
          <DialogDescription>
            This uninstalls the Laminar app from {accountLogin} on GitHub and unlinks the repositories of every project
            in this workspace.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isRemoving}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDisconnect} disabled={isRemoving}>
            {isRemoving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Disconnect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
