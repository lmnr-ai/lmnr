import { useProjectContext } from '@/contexts/project-context';
import { useUserContext } from '@/contexts/user-context';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/const';
import { LabelClass, Trace } from '@/lib/traces/types';
import { createClient } from '@supabase/supabase-js';
import { ColumnDef } from '@tanstack/react-table';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect, useMemo } from 'react';
import ClientTimestampFormatter from '../client-timestamp-formatter';
import TracesPagePlaceholder from './page-placeholder';
import { EventTemplate } from '@/lib/events/types';
import DateRangeFilter from '../ui/date-range-filter';
import { DataTable } from '../ui/datatable';
import DataTableFilter from '../ui/datatable-filter';
import TextSearchFilter from '../ui/text-search-filter';
import { Button } from '../ui/button';
import { ArrowRight, RefreshCcw } from 'lucide-react';
import { PaginatedGetResponseWithProjectPresenceFlag, PaginatedResponse } from '@/lib/types';
import Mono from '../ui/mono';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '../ui/tooltip';
import { Feature } from '@/lib/features/features';
import { isFeatureEnabled } from '@/lib/features/features';
import SpanTypeIcon from './span-type-icon';

interface TracesTableProps {
  onRowClick?: (rowId: string) => void;
}

const renderCost = (val: any) => {
  if (val == null) {
    return '-';
  }
  return `$${parseFloat(val).toFixed(5) || val}`;
};

export default function TracesTable({ onRowClick }: TracesTableProps) {
  const searchParams = new URLSearchParams(useSearchParams().toString());
  const pathName = usePathname();
  const router = useRouter();
  const pageNumber = searchParams.get('pageNumber')
    ? parseInt(searchParams.get('pageNumber')!)
    : 0;
  const pageSize = searchParams.get('pageSize')
    ? parseInt(searchParams.get('pageSize')!)
    : 50;
  const filter = searchParams.get('filter');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const pastHours = searchParams.get('pastHours');
  const textSearchFilter = searchParams.get('search');
  const { projectId } = useProjectContext();
  const [traces, setTraces] = useState<Trace[] | undefined>(undefined);
  const [totalCount, setTotalCount] = useState<number>(0); // including the filtering
  const [anyInProject, setAnyInProject] = useState<boolean>(true);
  const [canRefresh, setCanRefresh] = useState<boolean>(false);
  const pageCount = Math.ceil(totalCount / pageSize);
  const [traceId, setTraceId] = useState<string | null>(
    searchParams.get('traceId') ?? null
  );

  const isCurrentTimestampIncluded =
    !!pastHours || (!!endDate && new Date(endDate) >= new Date());

  const getTraces = async () => {
    let queryFilter = searchParams.get('filter');
    console.log('queryFilter', queryFilter);
    setTraces(undefined);

    if (!pastHours && !startDate && !endDate) {
      const sp = new URLSearchParams();
      for (const [key, value] of Object.entries(searchParams)) {
        if (key !== 'pastHours') {
          sp.set(key, value as string);
        }
      }
      sp.set('pastHours', '24');
      router.replace(`${pathName}?${sp.toString()}`);
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
    if (typeof queryFilter === 'string') {
      url += `&filter=${encodeURIComponent(queryFilter)}`;
    } else if (Array.isArray(queryFilter)) {
      const filters = encodeURIComponent(JSON.stringify(queryFilter));
      url += `&filter=${filters}`;
    }
    if (typeof textSearchFilter === 'string' && textSearchFilter.length > 0) {
      url += `&search=${textSearchFilter}`;
    }

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const data = (await res.json()) as PaginatedGetResponseWithProjectPresenceFlag<Trace>;

    setTraces(data.items);
    setTotalCount(data.totalCount);
    setAnyInProject(data.anyInProject);
  };

  useEffect(() => {
    console.log('TracesTable useEffect', filter);
    getTraces();
  }, [
    projectId,
    pageNumber,
    pageSize,
    filter,
    pastHours,
    startDate,
    endDate,
    textSearchFilter
  ]);

  const handleRowClick = (row: Trace) => {
    searchParams.set('traceId', row.id!);
    searchParams.delete('spanId');
    onRowClick?.(row.id!);
    router.push(`${pathName}?${searchParams.toString()}`);
  };

  useEffect(() => {
    setTraceId(searchParams.get('traceId') ?? null);
  }, [searchParams]);

  const columns: ColumnDef<Trace, any>[] = [
    // {
    //   accessorFn: (row) => (row.success ? 'Success' : 'Failed'),
    //   header: 'Status',
    //   cell: (row) => <StatusLabel success={row.getValue() === 'Success'} />,
    //   id: 'status',
    //   size: 100
    // },
    {
      cell: (row) => <Mono className='text-xs'>{row.getValue()}</Mono>,
      header: 'ID',
      accessorKey: 'id',
      id: 'id'
    },
    {
      accessorKey: 'topSpanType',
      header: 'Top level span',
      id: 'top_span_type',
      cell: (row) => <div className='flex space-x-2 items-center'>
        <SpanTypeIcon className='z-10' spanType={row.getValue()} />
        <div className='flex text-sm'>{row.getValue() === 'DEFAULT' ? 'SPAN' : row.getValue()}</div>
      </div>,
      size: 120
    },
    {
      accessorKey: 'topSpanName',
      header: 'Top span name',
      id: 'top_span_name'
    },
    {
      cell: (row) => row.getValue(),
      accessorKey: 'topSpanInputPreview',
      header: 'Input',
      id: 'input',
      size: 150
    },
    {
      cell: (row) => row.getValue(),
      // <TooltipProvider delayDuration={250}>
      //   <Tooltip>
      //     <TooltipTrigger className="relative p-0">
      //       <div
      //         style={{
      //           width: row.column.getSize() - 32
      //         }}
      //         className="relative"
      //       >
      //         <div className="absolute inset-0 top-[-4px] items-center h-full flex">
      //           <div className="text-ellipsis overflow-hidden whitespace-nowrap">
      //             {row.getValue()}
      //           </div>
      //         </div>
      //       </div>
      //     </TooltipTrigger>
      //     <TooltipContent side="bottom" className="p-0 border">
      //       <ScrollArea className="max-h-48 overflow-y-auto p-4">
      //         <div>
      //           <p className="max-w-sm break-words whitespace-pre-wrap">
      //             {row.getValue()}
      //           </p>
      //         </div>
      //       </ScrollArea>
      //     </TooltipContent>
      //   </Tooltip>
      // </TooltipProvider>,
      accessorKey: 'topSpanOutputPreview',
      header: 'Output',
      id: 'output',
      size: 150
    },
    {
      accessorFn: (row) => row.startTime,
      header: 'Timestamp',
      cell: (row) => (
        <ClientTimestampFormatter timestamp={String(row.getValue())} />
      ),
      id: 'start_time',
      size: 125
    },
    {
      accessorFn: (row) => {
        const start = new Date(row.startTime);
        const end = new Date(row.endTime);
        const duration = end.getTime() - start.getTime();

        return `${(duration / 1000).toFixed(2)}s`;
      },
      header: 'Latency',
      id: 'latency',
      size: 80
    },
    {
      accessorFn: (row) => row.cost,
      header: 'Cost',
      id: 'cost',
      cell: (row) =>
        <TooltipProvider delayDuration={100}>
          <Tooltip>
            <TooltipTrigger className="relative p-0">
              <div
                style={{
                  width: row.column.getSize() - 32
                }}
                className="relative"
              >
                <div className="absolute inset-0 top-[-4px] items-center h-full flex">
                  <div className="text-ellipsis overflow-hidden whitespace-nowrap">
                    {renderCost(row.getValue())}
                  </div>
                </div>
              </div>
            </TooltipTrigger>
            {row.getValue() != undefined &&
              <TooltipContent side="bottom" className="p-2 border">
                <div>
                  <div className='flex justify-between space-x-2'>
                    <span>Input cost</span>
                    <span>{renderCost(row.row.original.inputCost)}</span>
                  </div>
                  <div className='flex justify-between space-x-2'>
                    <span>Output cost</span>
                    <span>{renderCost(row.row.original.outputCost)}</span>
                  </div>
                </div>
              </TooltipContent>
            }
          </Tooltip>
        </TooltipProvider>,
      size: 100
    },
    {
      accessorFn: (row) => row.totalTokenCount ?? '-',
      header: 'Tokens',
      id: 'total_token_count',
      cell: (row) => <div className='flex items-center'>
        {`${row.row.original.inputTokenCount ?? '-'}`}
        <ArrowRight size={12} className='mx-1 min-w-[12px]' />
        {`${row.row.original.outputTokenCount ?? '-'}`}
        {` (${row.row.original.totalTokenCount ?? '-'})`}
      </div>,
      size: 150
    },
  ];

  const extraFilterCols = [
    {
      header: 'Input tokens',
      id: 'input_token_count',
    },
    {
      header: 'Output tokens',
      id: 'output_token_count',
    },
    {
      header: 'Input cost',
      id: 'input_cost',
    },
    {
      header: 'Output cost',
      id: 'output_cost',
    },
    {
      header: 'events',
      id: `event`
    },
    {
      header: 'labels',
      id: `label`
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
    event: events?.map((event) => event.name) ?? [],
    label: labels?.map((label) => label.name) ?? []
  };

  const { supabaseAccessToken } = useUserContext();

  const supabase = useMemo(() => {
    if (!isFeatureEnabled(Feature.SUPABASE) || !supabaseAccessToken) {
      return null;
    }

    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${supabaseAccessToken}`
        }
      }
    });
  }, []);

  if (supabase) {
    supabase.realtime.setAuth(supabaseAccessToken);
  }

  useEffect(() => {
    if (!supabase) {
      return;
    }

    // When enableStreaming changes, need to remove all channels and, if enabled, re-subscribe
    supabase.channel('table-db-changes').unsubscribe();

    supabase
      .channel('table-db-changes')
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
      supabase.removeAllChannels();
    };
  }, []);

  if (traces != undefined && totalCount === 0 && !anyInProject) {
    return <TracesPagePlaceholder />;
  }

  const filterColumns = columns
    .filter(
      (column) => !['start_time', 'events', 'input', 'output'].includes(column.id!)
    )
    .concat(extraFilterCols);

  return (
    <DataTable
      className="border-none w-full"
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
      <DataTableFilter
        columns={filterColumns}
        customFilterColumns={customFilterColumns}
      />
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
