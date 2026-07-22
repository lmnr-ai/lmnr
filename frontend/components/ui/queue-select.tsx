import { Plus } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback } from "react";
import useSWR from "swr";

import CreateQueueDialog from "@/components/queues/create-queue-dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type LabelingQueue, type LabelingQueueWithProgress } from "@/lib/queue/types";
import { type PaginatedResponse } from "@/lib/types";
import { cn, swrFetcher } from "@/lib/utils";

interface QueueSelectProps {
  className?: string;
  onChange: (queue: LabelingQueue) => void;
  value?: string;
}

export default function QueueSelect({ onChange, value, className }: QueueSelectProps) {
  const { projectId } = useParams();
  const { data, isLoading } = useSWR<PaginatedResponse<LabelingQueueWithProgress>>(
    `/api/projects/${projectId}/queues`,
    swrFetcher
  );

  const onValueChange = useCallback(
    (id: string | null) => {
      if (id == null) return;
      const queue = data?.items?.find((q) => q.id === id);
      if (queue) onChange(queue);
    },
    [data?.items, onChange]
  );

  return (
    <Select disabled={isLoading} value={value} onValueChange={onValueChange}>
      <SelectTrigger className={cn("font-medium focus:ring-0", className)}>
        <SelectValue placeholder="Select labeling queue" />
      </SelectTrigger>
      <SelectContent>
        {(data?.items || []).map((queue) => (
          <SelectItem key={queue.id} value={queue.id}>
            {queue.name}
          </SelectItem>
        ))}
        <CreateQueueDialog>
          <Button
            variant="ghost"
            className="relative flex h-auto w-full cursor-pointer justify-start rounded-sm py-1.5 pl-2 pr-8 text-sm font-normal hover:bg-secondary"
          >
            <Plus className="w-3 h-3 mr-2" />
            <span className="text-xs">Create new queue</span>
          </Button>
        </CreateQueueDialog>
      </SelectContent>
    </Select>
  );
}
