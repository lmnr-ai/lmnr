import { useProjectContext } from '@/contexts/project-context';
import { useUserContext } from '@/contexts/user-context';
import { SUPABASE_URL, SUPABASE_ANON_KEY, USE_REALTIME } from '@/lib/const';
import { LabelClass, Trace } from '@/lib/traces/types';
import { createClient } from '@supabase/supabase-js';
import { ColumnDef } from '@tanstack/react-table';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect, useMemo } from 'react';
import ClientTimestampFormatter from '../client-timestamp-formatter';
import StatusLabel from '../ui/status-label';
import TracesPagePlaceholder from './page-placeholder';
import { Event, EventTemplate } from '@/lib/events/types';
import DateRangeFilter from '../ui/date-range-filter';
import { DataTable } from '../ui/datatable';
import DataTableFilter from '../ui/datatable-filter';
import TextSearchFilter from '../ui/text-search-filter';
import { Button } from '../ui/button';
import { RefreshCcw } from 'lucide-react';
import { PaginatedResponse } from '@/lib/types';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/utils';

interface TracesTableProps {
  onRowClick?: (rowId: string) => void;
}

export default function TracesTable({ onRowClick }: TracesTableProps) {
  const searchParams = new URLSearchParams(useSearchParams().toString());
  const pathName = usePathname();
  const router = useRouter();
  const pageNumber = searchParams.get('pageNumber') ? parseInt(searchParams.get('pageNumber')!) : 0;
  const pageSize = searchParams.get('pageSize') ? parseInt(searchParams.get('pageSize')!) : 50;
  const filter = searchParams.get('filter');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const pastHours = searchParams.get('pastHours');
  const textSearchFilter = searchParams.get('search');
  const { projectId } = useProjectContext();
  const [traces, setTraces] = useState<Trace[] | undefined>(undefined);
  const [totalCount, setTotalCount] = useState<number>(0);  // including the filtering
  const [anyInProject, setAnyInProject] = useState<boolean>(true);
  const [canRefresh, setCanRefresh] = useState<boolean>(false);
  const pageCount = Math.ceil(totalCount / pageSize);
  const [traceId, setTraceId] = useState<string | null>(searchParams.get('traceId') ?? null);

  const isCurrentTimestampIncluded = (!!pastHours) || ((!!endDate) && new Date(endDate) >= new Date());

  const getTraces = async () => {

    setTraces(undefined);

    if (!pastHours && !startDate && !endDate) {
      const sp = new URLSearchParams();
      for (const [key, value] of Object.entries(searchParams)) {
        if (key !== 'pastHours') {
          sp.set(key, value as string);
        }
      }
      sp.set('pastHours', '24');
      router.push(`${pathName}?${sp.toString()}`);
      return;
    }

    let url = `/api/projects/${projectId}/traces?pageNumber=${pageNumber}&pageSize=${pageSize}`;
    if (pastHours != null) {
      url += `&pastHours=${pastHours}`;
    }
    if (startDate != null) {
      url += `&startDate=${startDate}`;
    }
    if (endDate != null) {
      url += `&endDate=${endDate}`;
    }
    if (typeof filter === 'string') {
      url += `&filter=${encodeURI(filter)}`;
    } else if (Array.isArray(filter)) {
      const filters = encodeURI(JSON.stringify(filter));
      url += `&filter=${filters}`;
    }
    if (typeof textSearchFilter === 'string' && textSearchFilter.length > 0) {
      url += `&search=${textSearchFilter}`;
    }

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await res.json() as PaginatedResponse<Trace>;

    setTraces(data.items);
    setTotalCount(data.totalCount);
    setAnyInProject(data.anyInProject);

  };

  useEffect(() => {
    getTraces();
  }, [projectId, pageNumber, pageSize, filter, pastHours, startDate, endDate, textSearchFilter]);

  const handleRowClick = (row: Trace) => {
    searchParams.set('traceId', row.id!);
    searchParams.delete('spanId');
    onRowClick?.(row.id!);
    setTraceId(row.id);
    router.push(`${pathName}?${searchParams.toString()}`);
  };

  const columns: ColumnDef<Trace, any>[] = [
    {
      accessorFn: (row) => row.success ? 'Success' : 'Failed',
      header: 'Status',
      cell: (row) => <StatusLabel success={row.getValue() === 'Success'} />,
      id: 'status'
    },
    {
      accessorKey: 'id',
      header: 'ID',
      id: 'id',
    },
    {
      accessorKey: 'sessionId',
      header: 'Session ID',
      id: 'session_id',
    },
    {
      accessorFn: (row) => row.startTime,
      header: 'Timestamp',
      cell: (row) => <ClientTimestampFormatter timestamp={String(row.getValue())} />,
      id: 'start_time'
    },
    {
      accessorFn: (row) => {
        const start = new Date(row.startTime);
        const end = new Date(row.endTime);
        const duration = end.getTime() - start.getTime();

        return `${(duration / 1000).toFixed(2)}s`;
      },
      header: 'Latency',
      id: 'latency'
    },
    {
      accessorFn: (row) => '$' + row.cost?.toFixed(5),
      header: 'Cost',
      id: 'cost'
    },
    {
      accessorKey: 'totalTokenCount',
      header: 'Token Count',
      id: 'total_token_count'
    },
    {
      accessorFn: (row) => row.events,
      id: 'events',
      cell: (row) => {
        const eventNames = [...new Set((row.getValue() as Event[]).map((event) => event.templateName))];

        return (
          <div className='flex space-x-2'>
            {eventNames.map((eventName, index) => (
              <div key={index} className='flex items-center rounded p-0.5 border text-xs text-secondary-foreground px-2 bg-secondary'>
                <span>{eventName}</span>
              </div>
            ))}
          </div>
        );
      },
      header: 'events',
    }

  ];

  const extraFilterCols = [
    {
      header: 'events',
      id: 'event',
    },
    {
      header: 'labels',
      id: 'label',
    }
  ];

  const { data: events } = useSWR<EventTemplate[]>(
    `/api/projects/${projectId}/event-templates`,
    swrFetcher
  );
  const { data: labels } = useSWR<LabelClass[]>(
    `/api/projects/${projectId}/label-classes`,
    swrFetcher
  );

  const customFilterColumns = {
    'event': events?.map(event => event.name) ?? [],
    'label': labels?.map(label => label.name) ?? [],
  };

  const { supabaseAccessToken } = useUserContext();
  const supabase = useMemo(() => USE_REALTIME
    ? createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
      {
        global: {
          headers: {
            Authorization: `Bearer ${supabaseAccessToken}`,
          },
        },
      }
    )
    : null, []);

  supabase?.realtime.setAuth(supabaseAccessToken);

  useEffect(() => {
    // When enableStreaming changes, need to remove all channels and, if enabled, re-subscribe
    supabase?.channel('table-db-changes').unsubscribe();

    supabase
      ?.channel('table-db-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'traces',
          filter: `project_id=eq.${projectId}`
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setCanRefresh(isCurrentTimestampIncluded);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'traces',
          filter: `project_id=eq.${projectId}`
        },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            setCanRefresh(isCurrentTimestampIncluded);
          }
        }
      )
      .subscribe();

    // remove all channels on unmount
    return () => {
      supabase?.removeAllChannels();
    };
  }, []);

  if (traces != undefined && totalCount === 0 && !anyInProject) {
    return <TracesPagePlaceholder />;
  }

  const filterColumns = columns
    .filter(column => !['actions', 'start_time', 'events'].includes(column.id!))
    .concat(extraFilterCols);

  return (
    <DataTable
      className='border-none w-full'
      columns={columns}
      data={traces}
      getRowId={(trace) => trace.id}
      onRowClick={(row) => {
        handleRowClick(row.original);
      }}
      paginated
      focusedRowId={traceId}
      manualPagination
      pageCount={pageCount}
      defaultPageSize={pageSize}
      defaultPageNumber={pageNumber}
      onPageChange={(pageNumber, pageSize) => {
        searchParams.set('pageNumber', pageNumber.toString());
        searchParams.set('pageSize', pageSize.toString());
        router.push(`${pathName}?${searchParams.toString()}`);
      }}
      totalItemsCount={totalCount}
      enableRowSelection
    >
      <TextSearchFilter />
      <DataTableFilter columns={filterColumns} customFilterColumns={customFilterColumns} />
      <DateRangeFilter />
      <Button
        onClick={() => {
          setCanRefresh(false);
          getTraces();
        }}
        variant="outline"
      >
        <RefreshCcw size={16} className="mr-2" />
        Refresh
      </Button>
    </DataTable>
  );
}
