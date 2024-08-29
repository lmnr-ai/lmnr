import { swrFetcher } from "@/lib/utils";
import useSWR from "swr";
import SpanEventsAddEvent from "./span-events-add-event";
import { Skeleton } from "../ui/skeleton";
import { Span } from "@/lib/traces/types";
import { useProjectContext } from "@/contexts/project-context";
import Formatter from "../ui/formatter";
import { useEffect, useState } from "react";
import { Event } from "@/lib/events/types";
import { ScrollArea } from "../ui/scroll-area";

interface TagsProps {
  span: Span;
}

export default function SpanEvents({ span }: TagsProps) {
  const { projectId } = useProjectContext();

  const [events, setEvents] = useState<Event[]>([]);

  // const { data, isLoading, mutate } = useSWR(`/api/projects/${projectId}/traces/${span.traceId}/spans/${span.id}/events`, swrFetcher);

  useEffect(() => {
    if (!span) return;
    console.log(span.events)
    setEvents(span.events ?? [])
  }, [span])

  return (
    <div className='flex'>
      <ScrollArea className='flex flex-grow overflow-auto'>
        <div className="max-h-0">
          <div className="flex flex-col space-y-4 p-4">
            {events.map((event, index) => {
              return (
                <div key={index} className='flex flex-col border rounded'>
                  <div className="p-2">{event.templateName}</div>
                  {event.value &&
                    <div className="p-2 border-t">{event.value}</div>
                  }
                  {event.metadata?.["reasoning"] &&
                    <div className="border-t p-2 text-secondary-foreground text-xs whitespace-pre-wrap">{event.metadata?.["reasoning"]}</div>
                  }
                </div>
              )
            })}
          </div>
        </div>
      </ScrollArea>
    </div >
  )
}
