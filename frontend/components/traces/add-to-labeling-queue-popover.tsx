import { Loader2, Pen, Plus } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PropsWithChildren, useCallback, useState } from "react";
import useSWR from "swr";

import CreateQueueDialog from "@/components/queues/create-queue-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/lib/hooks/use-toast";
import { LabelingQueue } from "@/lib/queue/types";
import { PaginatedResponse } from "@/lib/types";
import { swrFetcher } from "@/lib/utils";

interface AddToLabelingQueuePopoverProps {
  data?: { metadata: Record<string, unknown>; payload: Record<string, unknown> }[];
  datapointIds?: string[];
  datasetId?: string;
}

export default function AddToLabelingQueuePopover({
  data,
  datapointIds,
  datasetId,
  children,
}: PropsWithChildren<AddToLabelingQueuePopoverProps>) {
  const [selectedQueue, setSelectedQueue] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const { projectId } = useParams();
  const { toast } = useToast();

  const isDatapointMode = datapointIds && datasetId;

  const { data: labelingQueues, isLoading: isQueuesLoading } = useSWR<PaginatedResponse<LabelingQueue>>(
    `/api/projects/${projectId}/queues`,
    swrFetcher
  );

  const handleAddToQueue = useCallback(async () => {
    if (!selectedQueue) return;
    setIsLoading(true);

    try {
      const response = await fetch(
        isDatapointMode
          ? `/api/projects/${projectId}/datasets/${datasetId}/datapoints/push-to-queue`
          : `/api/projects/${projectId}/queues/${selectedQueue}/push`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(isDatapointMode ? { datapointIds, queueId: selectedQueue } : data),
        }
      );

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
  }, [data, datapointIds, datasetId, projectId, selectedQueue, toast, isDatapointMode]);

  const handleValueChange = (value: string) => {
    if (value === "create-queue") {
      return;
    }
    setSelectedQueue(value);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {children || (
          <Badge className="cursor-pointer h-fit flex-nowrap min-w-8" variant="secondary">
            <Pen className="size-3 min-w-3" />
            <span className="ml-2 text-xs truncate block min-w-0">Add to labeling queue</span>
          </Badge>
        )}
      </PopoverTrigger>

      <PopoverContent className="w-80" align="start" side="bottom">
        <div className="flex flex-col space-y-4">
          <span className="font-medium">Add to Labeling Queue</span>
          <Select disabled={isQueuesLoading} value={selectedQueue} onValueChange={handleValueChange}>
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
                  <span className="text-xs">Create new queue</span>
                </div>
              </CreateQueueDialog>
            </SelectContent>
          </Select>
          <Button className="ml-auto" onClick={handleAddToQueue} disabled={!selectedQueue || isLoading}>
            {isLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Add to queue
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
