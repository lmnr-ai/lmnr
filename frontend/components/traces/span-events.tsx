
import { useEffect, useState } from 'react';

import { Event } from '@/lib/events/types';
import { Span } from '@/lib/traces/types';
import { convertToLocalTimeWithMillis } from '@/lib/utils';

import Formatter from '../ui/formatter';

interface TagsProps {
  span: Span;
}

export default function SpanEvents({ span }: TagsProps) {
  const [events, setEvents] = useState<Event[]>([]);

  useEffect(() => {
    if (!span) return;
    setEvents(span.events ?? []);
  }, [span]);

  const value = events.map((event) => ({
    name: event.name,
    timestamp: convertToLocalTimeWithMillis(event.timestamp),
    attributes: event.attributes
  }));

  return (
    <div className="border-none flex inset-0 absolute flex-grow">
      <div className="flex flex-grow h-full w-full">
        <Formatter value={JSON.stringify(value)} defaultMode="yaml" />
      </div>
    </div>
  );
}
