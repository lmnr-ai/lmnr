import { TIME_MILLISECONDS_FORMAT, swrFetcher } from '@/lib/utils';
import useSWR from 'swr';
import SpanEventsAddEvent from './span-events-add-event';
import { Skeleton } from '../ui/skeleton';
import { Span } from '@/lib/traces/types';
import { useProjectContext } from '@/contexts/project-context';
import Formatter from '../ui/formatter';
import { useEffect, useState } from 'react';
import { Event } from '@/lib/events/types';
import { ScrollArea } from '../ui/scroll-area';
import { DataTable } from '../ui/datatable';
import { ColumnDef } from '@tanstack/react-table';
import ClientTimestampFormatter from '../client-timestamp-formatter';

interface TagsProps {
  span: Span;
}

export default function SpanEvents({ span }: TagsProps) {

  const [events, setEvents] = useState<Event[]>([]);

  useEffect(() => {
    if (!span) return;
    setEvents(span.events ?? []);
  }, [span]);

  const columns: ColumnDef<Event>[] = [
    {
      accessorKey: 'templateName',
      header: 'Event Name',
    },
    {
      accessorKey: 'timestamp',
      header: 'Timestamp',
      cell: ({ row }) => (
        <ClientTimestampFormatter timestamp={row.original.timestamp} format={TIME_MILLISECONDS_FORMAT} />
      ),
    },
    {
      accessorKey: 'value',
      header: 'Value',
      cell: ({ row }) => (
        <div className="max-w-[300px] truncate">
          {JSON.stringify(row.original.value)}
        </div>
      ),
    },
  ];

  return (
    <div className="border-none flex inset-0 absolute flex-grow">

      <div className="flex flex-grow h-full w-full">
        <DataTable columns={columns} data={events} className="h-full w-full border-none" />
      </div>
    </div>
  );
}
