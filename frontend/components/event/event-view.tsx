import { convertToLocalTimeWithMillis, swrFetcher } from '@/lib/utils';

import { Button } from '../ui/button';
import { ChevronsRight } from 'lucide-react';
import { Event } from '@/lib/events/types';
import Formatter from '../ui/formatter';
import { Label } from '../ui/label';
import Mono from '../ui/mono';
import { ScrollArea } from '../ui/scroll-area';
import { Span } from '@/lib/traces/types';
import { useProjectContext } from '@/contexts/project-context';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';

interface EventViewProps {
  onClose: () => void;
  event: Event;
}

export default function EventView({ onClose, event }: EventViewProps) {
  const { projectId } = useProjectContext();
  const { data: span, isLoading } = useSWR<Span>(
    `/api/projects/${projectId}/spans/${event.spanId}`,
    swrFetcher
  );
  const traceId = span?.traceId;
  const router = useRouter();

  return (
    <ScrollArea className="w-full">
      <div className="flex flex-col h-full w-full overflow-clip">
        <div className="h-12 flex flex-none items-center border-b space-x-2 pl-3">
          <Button variant={'ghost'} className="px-1" onClick={onClose}>
            <ChevronsRight />
          </Button>
          <div>Event</div>
          <Mono className="text-secondary-foreground">{event.id}</Mono>
        </div>
        <div className="flex-grow flex-col flex space-y-2 p-4">
          <div className="flex justify-between">
            <div className="flex flex-col">
              <Label>Timestamp</Label>
              <Mono className="text-secondary-foreground">
                {`${new Date(event.timestamp).toLocaleDateString()} ` +
                  convertToLocalTimeWithMillis(event.timestamp)}
              </Mono>
            </div>
            <Button
              variant={'secondary'}
              onClick={() => {
                const timestamp = new Date(event.timestamp);
                const startTime = new Date(
                  timestamp.getTime() - 60_000
                ).toISOString();
                const endTime = new Date(
                  timestamp.getTime() + 60_000
                ).toISOString();
                router.push(
                  `/project/${projectId}/traces?traceId=${traceId}&startDate=${startTime}&endDate=${endTime}&spanId=${event.spanId}`
                );
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
          <Formatter
            value={
              typeof event.value === 'string'
                ? event.value
                : JSON.stringify(event.value)
            }
            defaultMode="json"
          />
          <Label className="py-1">Inputs</Label>
          <Formatter value={JSON.stringify(event.inputs)} defaultMode="json" />
        </div>
      </div>
    </ScrollArea>
  );
}
