import { Loader2, Pen } from 'lucide-react';
import { useState } from 'react';
import useSWR from 'swr';

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useProjectContext } from '@/contexts/project-context';
import { useToast } from "@/lib/hooks/use-toast";
import { LabelingQueue } from '@/lib/queue/types';
import { Span } from '@/lib/traces/types';
import { PaginatedResponse } from '@/lib/types';
import { swrFetcher } from '@/lib/utils';

interface AddToLabelingQueuePopoverProps {
  span: Span;
  onSuccess?: () => void;
}

export default function AddToLabelingQueuePopover({
  span,
  onSuccess
}: AddToLabelingQueuePopoverProps) {
  const [selectedQueue, setSelectedQueue] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const { projectId } = useProjectContext();
  const { toast } = useToast();

  const { data: labelingQueues } = useSWR<PaginatedResponse<LabelingQueue>>(
    `/api/projects/${projectId}/queues`,
    swrFetcher
  );


  const handleAddToQueue = async () => {
    if (!selectedQueue) return;
    setIsLoading(true);

    try {

      const response = await fetch(`/api/projects/${projectId}/queues/${selectedQueue}/push`, {
        method: 'POST',
        body: JSON.stringify({ spanId: span.spanId })
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: "Successfully added span to labeling queue",
        });
        onSuccess?.();
        setOpen(false);
      } else {
        toast({
          title: "Error",
          description: "Failed to add to labeling queue",
          variant: "destructive",
        });
        console.error('Failed to add to labeling queue:', response.statusText);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add to labeling queue",
        variant: "destructive",
      });
      console.error('Failed to add to labeling queue:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline">
          <Pen className="w-4 h-4 mr-2" />
          Add to labeling queue
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-80" align="start" side="bottom">
        <div className="space-y-4">
          <div className="font-medium">Add to Labeling Queue</div>

          <Select
            value={selectedQueue}
            onValueChange={setSelectedQueue}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a labeling queue" />
            </SelectTrigger>
            <SelectContent>
              {labelingQueues?.items && labelingQueues.items.map((queue) => (
                <SelectItem key={queue.id} value={queue.id}>
                  {queue.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex justify-end">
            <Button
              onClick={handleAddToQueue}
              disabled={!selectedQueue || isLoading}
            >
              {isLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Add to queue
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
