import { ChevronsRight } from "lucide-react";
import { Button } from "../ui/button";
import Mono from "../ui/mono";
import { Event } from "@/lib/events/types";
import { Label } from "../ui/label";
import Formatter from "../ui/formatter";
import { ScrollArea } from "../ui/scroll-area";
import { useProjectContext } from "@/contexts/project-context";
import useSWR from "swr";
import { convertToLocalTimeWithMillis, swrFetcher } from "@/lib/utils";
import { useRouter } from "next/navigation";

interface EventViewProps {
  onClose: () => void;
  event: Event;
}

export default function EventView({
  onClose,
  event,
}: EventViewProps) {
  const { projectId } = useProjectContext();
  const { data: traceId, isLoading } = useSWR(
    `/api/projects/${projectId}/trace-id-for-span/${event.spanId}`,
    swrFetcher
  ) as { data: string, isLoading: boolean };
  const router = useRouter();

  return (
    <ScrollArea className="w-full">
      <div className='flex flex-col h-full w-full overflow-clip'>
        <div className='h-12 flex flex-none items-center border-b space-x-2 pl-3'>
          <Button
            variant={'ghost'}
            className='px-1'
            onClick={onClose}
          >
            <ChevronsRight />
          </Button>
          <div>
            Event
          </div>
          <Mono className='text-secondary-foreground'>
            {event.id}
          </Mono>
        </div>
        <div className='flex-grow flex-col flex space-y-2 p-4'>
          <div className='flex justify-between'>
            <div className='flex flex-col'>
              <Label>Timestamp</Label>
              <Mono className="text-secondary-foreground">
                {`${new Date(event.timestamp).toLocaleDateString()} ` + convertToLocalTimeWithMillis(event.timestamp)}
                </Mono>
            </div>
            <Button
              variant={'secondary'}
              onClick={() => {
                const timestamp = new Date(event.timestamp);
                const startTime = new Date(timestamp.getTime() - 60_000).toISOString();
                const endTime = new Date(timestamp.getTime() + 60_000).toISOString();
                router.push(`/project/${projectId}/traces?selectedid=${traceId}&startDate=${startTime}&endDate=${endTime}`);
              }}
              disabled={!traceId || isLoading}

            >
              Go to trace
            </Button>
          </div>
          <div className="flex space-x-2">
            <h2>{event.templateName}</h2>
            <Mono className="text-secondary-foreground border-2 p-1">
              {event.templateEventType}
            </Mono>
          </div>
          <Formatter value={typeof (event.value) === 'string' ? event.value : JSON.stringify(event.value)} defaultMode="json" />
          <Label className="py-1">Inputs</Label>
          <Formatter value={JSON.stringify(event.inputs)} defaultMode="json" />
        </div>
      </div>
    </ScrollArea>
  )
}
