'use client';

import { useProjectContext } from '@/contexts/project-context';
import { ColumnDef } from '@tanstack/react-table';
import ClientTimestampFormatter from '../client-timestamp-formatter';
import { useRouter } from 'next/navigation';
import { DataTable } from '../ui/datatable';
import Mono from '../ui/mono';
import Header from '../ui/header';
import { EventTemplate } from '@/lib/events/types';
import { useUserContext } from '@/contexts/user-context';

export interface EventsProps {
  events: EventTemplate[];
}

export default function Events({ events }: EventsProps) {
  const { projectId } = useProjectContext();
  const router = useRouter();
  const { email } = useUserContext();

  const columns: ColumnDef<EventTemplate>[] = [
    {
      accessorKey: 'id',
      cell: (row) => <Mono>{String(row.getValue())}</Mono>,
      header: 'ID',
      size: 300
    },
    {
      accessorKey: 'name',
      header: 'Name',
    },
    {
      header: 'Last occurrence',
      accessorKey: 'latestTimestamp',
      cell: (row) => <ClientTimestampFormatter timestamp={String(row.getValue())} />,
    },
    {
      header: 'Type',
      accessorKey: 'eventType',
    },
  ];

  return (
    <div className="flex flex-col h-full">
      <Header path="events" />
      <div className="flex justify-between items-center flex-none h-14 p-4">
        <h3 className="scroll-m-20 text-lg font-semibold tracking-tight">
          Events
        </h3>
      </div>
      <div className="flex-grow">
        <DataTable
          columns={columns}
          data={events}
          onRowClick={(row) => {
            router.push(`/project/${projectId}/events/${row.original.id}`);
          }}
        />
      </div>
    </div>
  );
}
