'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { DataTable } from '../ui/datatable';
import { ColumnDef } from '@tanstack/react-table';
import ClientTimestampFormatter from '../client-timestamp-formatter';
import { Resizable } from 're-resizable';
import { Event } from '@/lib/events/types';
import EventsPagePlaceholder from '@/components/events/page-placeholder';
import EventView from './event-view';

// const sourceToText = (source: string) => {
//   switch (source) {
//     case 'AUTO':
//       return 'Online Eval';
//     case 'CODE':
//       return 'Code';
//     case 'MANUAL':
//       return 'UI';
//   }
// }

interface EventsProps {
  defaultEvents: Event[];
  totalEventsCount: number;
  pageCount: number;
  pageSize: number;
  pageNumber: number;
  totalInProject: number | null;
}

export default function Events({
  defaultEvents,
  totalEventsCount,
  pageCount,
  pageSize,
  pageNumber,
  totalInProject,
}: EventsProps) {
  const searchParams = new URLSearchParams(useSearchParams().toString());
  const pathName = usePathname();
  const router = useRouter();
  const [events, setEvents] = useState<Event[]>(defaultEvents);
  const [isSidePanelOpen, setIsSidePanelOpen] = useState<boolean>(false);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);

  const handleRowClick = async (row: Event) => {
    setSelectedEvent(row);
    // searchParams.set('selectedid', row.id!);
    // router.push(`${pathName}?${searchParams.toString()}`);
    setIsSidePanelOpen(true);
  };

  // useEffect(() => {
  //   const selectedid = searchParams.get('selectedid');
  //   if (selectedid != null) {
  //     setExpandedid(selectedid);
  //     setIsSidePanelOpen(true);
  //   }
  // }, []);

  const staticColumns: ColumnDef<Event, any>[] = [
    {
      accessorKey: 'id',
      header: 'ID',
      id: 'id',
    },
    {
      accessorKey: 'spanId',
      header: 'Span ID',
      id: 'span_id',
    },
    {
      accessorFn: (row) => {
        return row.timestamp
      },
      header: 'Timestamp',
      cell: (row) => <ClientTimestampFormatter timestamp={String(row.getValue())} />,
      id: 'timestamp'
    },
    // {
    //   accessorFn: (row) => {
    //     return sourceToText(row.source)
    //   },
    //   header: 'Source',
    //   id: 'source'
    // },
    {
      accessorKey: 'templateName',
      header: 'Name',
      id: 'name',
    },
    {
      accessorKey: 'templateEventType',
      header: 'Type',
      id: 'event_type',
    },
    {
      accessorKey: 'value',
      header: 'Value',
      id: 'value',
    },
    {
      accessorFn: (row) => {
        return (row.inputs !== null) ? JSON.stringify(row.inputs) : '-';
      },
      header: 'Inputs',
      id: 'inputs',
    },
  ]


  const columns = staticColumns

  useEffect(() => {
    setEvents(defaultEvents ?? [])
  }, [defaultEvents]);


  if (totalEventsCount === 0 && totalInProject === 0) {
    return <EventsPagePlaceholder />
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex flex-col w-full h-full relative">
        <div className='flex-grow'>
          <DataTable
            className='border-none'
            columns={columns}
            data={events}
            getRowId={(event) => event.id}
            onRowClick={async (row) => await handleRowClick(row)}
            paginated
            // focusedRowId={expandedid}
            manualPagination
            pageCount={pageCount}
            defaultPageSize={pageSize}
            defaultPageNumber={pageNumber}
            onPageChange={(pageNumber, pageSize) => {
              searchParams.set('pageNumber', pageNumber.toString());
              searchParams.set('pageSize', pageSize.toString());
              router.push(`${pathName}?${searchParams.toString()}`);
            }}
            totalItemsCount={totalEventsCount}
            filterColumns={
              columns.filter(column => !['value', 'inputs', 'timestamp'].includes(column.id!))
            }
            enableDateRangeFilter
          />
        </div>
        {isSidePanelOpen && (
          <div className='absolute top-0 right-0 bottom-0 bg-background border-l z-50 flex'>
            <Resizable
              enable={
                {
                  top: false,
                  right: false,
                  bottom: false,
                  left: true,
                  topRight: false,
                  bottomRight: false,
                  bottomLeft: false,
                  topLeft: false
                }
              }
              defaultSize={{
                width: 800,
              }}
            >
              <div className='w-full h-full flex'>
                <EventView
                  onClose={() => {
                    //   searchParams.delete('selectedid');
                    //   router.push(`${pathName}?${searchParams.toString()}`);
                    setIsSidePanelOpen(false)
                    //   setExpandedid(null);
                  }}
                  event={selectedEvent!}
                // traceId={expandedid!}
                />

              </div>
            </Resizable>
          </div>
        )}
      </div>
    </div >
  )
}