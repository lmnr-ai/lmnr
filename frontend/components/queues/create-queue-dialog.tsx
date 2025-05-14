import { Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import { PropsWithChildren, useCallback, useState } from "react";
import { useSWRConfig } from "swr";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/lib/hooks/use-toast";
import { LabelingQueue } from "@/lib/queue/types";
import { PaginatedResponse } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function CreateQueueDialog({ children }: PropsWithChildren) {
  const [newQueueName, setNewQueueName] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();
  const { projectId } = useParams();
  const { mutate } = useSWRConfig();
  const createNewQueue = useCallback(async () => {
    try {
      setIsLoading(true);

      const queue = {
        name: newQueueName,
        projectId: projectId,
      };

      const res = await fetch(`/api/projects/${projectId}/queues`, {
        method: "POST",
        body: JSON.stringify(queue),
      });

      if (!res.ok) {
        toast({ variant: "destructive", title: "Error", description: "Failed to create the queue" });
        setIsLoading(false);
        return;
      }

      const newQueue = (await res.json()) as LabelingQueue;

      await mutate<PaginatedResponse<LabelingQueue>>(
        `/api/projects/${projectId}/queues`,
        (currentData) =>
          currentData
            ? { items: [newQueue, ...currentData.items], totalCount: currentData.totalCount + 1 }
            : { items: [newQueue], totalCount: 1 },
        { revalidate: false, populateCache: true, rollbackOnError: true }
      );

      toast({ title: "Successfully created queue" });
      setIsDialogOpen(false);
      setIsLoading(false);
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to create the queue. Please try again.",
      });
    }
  }, [mutate, newQueueName, projectId, toast]);

  return (
    <Dialog
      open={isDialogOpen}
      onOpenChange={(open) => {
        setIsDialogOpen(open);
        setNewQueueName("");
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create new queue</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <Label>Name</Label>
          <Input autoFocus placeholder="Name" onChange={(e) => setNewQueueName(e.target.value)} />
        </div>
        <DialogFooter>
          <Button onClick={createNewQueue} disabled={!newQueueName || isLoading} handleEnter>
            <Loader2 className={cn("mr-2 hidden", isLoading ? "animate-spin block" : "")} size={16} />
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
