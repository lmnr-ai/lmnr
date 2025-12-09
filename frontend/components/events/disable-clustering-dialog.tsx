"use client";

import { Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import { PropsWithChildren, useCallback, useState } from "react";

import { useEventsStoreContext } from "@/components/events/events-store";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/lib/hooks/use-toast";
import { cn } from "@/lib/utils";

interface DisableClusteringDialogProps {
  eventName: string;
  eventType: "semantic" | "code";
}

export default function DisableClusteringDialog({
  children,
  eventName,
  eventType,
}: PropsWithChildren<DisableClusteringDialogProps>) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { projectId } = useParams();
  const { toast } = useToast();

  const { setClusterConfig } = useEventsStoreContext((state) => ({
    setClusterConfig: state.setClusterConfig,
  }));

  const handleDisable = useCallback(async () => {
    try {
      setIsLoading(true);

      const res = await fetch(`/api/projects/${projectId}/events/${eventName}/cluster-config?eventSource=${eventType}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const error = await res.json();
        toast({
          variant: "destructive",
          title: "Error",
          description: error.error || "Failed to disable clustering",
        });
        return;
      }

      setClusterConfig(undefined);
      toast({ title: "Clustering disabled successfully" });
      setOpen(false);
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to disable clustering",
      });
    } finally {
      setIsLoading(false);
    }
  }, [projectId, eventName, eventType, toast, setClusterConfig]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Disable Clustering</DialogTitle>
          <DialogDescription>
            Are you sure you want to disable clustering for this event?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDisable} disabled={isLoading}>
            <Loader2 className={cn("mr-2 hidden", isLoading && "animate-spin block")} size={16} />
            Disable
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

