import { Loader2, Plus } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PropsWithChildren, useCallback, useState } from "react";
import useSWR from "swr";

import CreateQueueDialog from "@/components/queues/create-queue-dialog";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/lib/hooks/use-toast";
import { LabelingQueue } from "@/lib/queue/types";
import { PaginatedResponse } from "@/lib/types";
import { swrFetcher } from "@/lib/utils";

interface AddToLabelingQueuePopoverProps {
  data?: {
    metadata: Record<string, unknown>;
    payload: {
      data: Record<string, unknown>;
      target: Record<string, unknown>;
      metadata: Record<string, unknown> | null;
    };
  }[];
  datapointIds?: string[];
  datasetId?: string;
  spanId?: string;
  buttonVariant?: "default" | "secondary" | "outline" | "ghost" | "link" | "destructive";
  buttonSize?: "default" | "sm" | "lg" | "icon";
}

export default function AddToLabelingQueuePopover({
  data,
  datapointIds,
  datasetId,
  spanId,
  buttonVariant = "secondary",
  buttonSize = "sm",
  children,
}: PropsWithChildren<AddToLabelingQueuePopoverProps>) {
  const [selectedQueue, setSelectedQueue] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const { projectId } = useParams();
  const { toast } = useToast();

  const isDatapointMode = datapointIds && datasetId;
  const isSpanMode = !!spanId;

  const { data: labelingQueues, isLoading: isQueuesLoading } = useSWR<PaginatedResponse<LabelingQueue>>(
    `/api/projects/${projectId}/queues`,
    swrFetcher
  );

  const handleAddToQueue = useCallback(async () => {
    if (!selectedQueue) return;
    setIsLoading(true);

    try {
      const response = await (async () => {
        if (isSpanMode) {
          return fetch(`/api/projects/${projectId}/spans/${spanId}/push`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              queueId: selectedQueue,
              metadata: {
                source: "span",
                id: spanId,
              },
            }),
          });
        }

        if (isDatapointMode) {
          return fetch(`/api/projects/${projectId}/datasets/${datasetId}/datapoints/push-to-queue`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ datapointIds, queueId: selectedQueue }),
          });
        }

        return fetch(`/api/projects/${projectId}/queues/${selectedQueue}/push`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(data),
        });
      })();

      if (response.ok) {
        toast({
          title: "Success",
          description: (
            <span>
              Successfully added to queue.{" "}
              <Link className="text-primary" href={`/project/${projectId}/labeling-queues/${selectedQueue}`}>
                Go to queue.
              </Link>
            </span>
          ),
        });
        setOpen(false);
      } else {
        toast({
          title: "Error",
          description: "Failed to add to labeling queue",
          variant: "destructive",
        });
        console.error("Failed to add to labeling queue:", response.statusText);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add to labeling queue",
        variant: "destructive",
      });
      console.error("Failed to add to labeling queue:", error);
    } finally {
      setIsLoading(false);
    }
  }, [data, datapointIds, datasetId, spanId, projectId, selectedQueue, toast, isDatapointMode, isSpanMode]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {children || (
          <Button size={buttonSize} icon="pen" className="w-fit" variant={buttonVariant}>
            <span className="text-xs truncate block min-w-0">Add to labeling queue</span>
          </Button>
        )}
      </PopoverTrigger>

      <PopoverContent className="w-80" align="start" side="bottom">
        <div className="flex flex-col space-y-4">
          <span className="font-medium">Add to Queue</span>
          <Select disabled={isQueuesLoading} value={selectedQueue} onValueChange={setSelectedQueue}>
            <SelectTrigger>
              <SelectValue placeholder="Select a labeling queue" />
            </SelectTrigger>
            <SelectContent>
              {labelingQueues?.items &&
                labelingQueues.items.map((queue) => (
                  <SelectItem key={queue.id} value={queue.id}>
                    {queue.name}
                  </SelectItem>
                ))}
              <CreateQueueDialog>
                <div className="relative flex w-full cursor-pointer hover:bg-secondary items-center rounded-sm py-1.5 pl-2 pr-8 text-sm">
                  <Plus className="w-3 h-3 mr-2" />
                  <span className="text-xs">Create queue</span>
                </div>
              </CreateQueueDialog>
            </SelectContent>
          </Select>
          <Button className="ml-auto" onClick={handleAddToQueue} disabled={!selectedQueue || isLoading}>
            {isLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Add
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
