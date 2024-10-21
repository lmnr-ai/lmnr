'use client';
import { useProjectContext } from '@/contexts/project-context';
import { LabelClass, Span } from '@/lib/traces/types';
import { ColumnDef } from '@tanstack/react-table';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import ClientTimestampFormatter from '../client-timestamp-formatter';
import DateRangeFilter from '../ui/date-range-filter';
import { DataTable } from '../ui/datatable';
import DataTableFilter from '../ui/datatable-filter';
import TextSearchFilter from '../ui/text-search-filter';
import { Button } from '../ui/button';
import { RefreshCcw } from 'lucide-react';
import { PaginatedResponse } from '@/lib/types';
import Mono from '../ui/mono';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '../ui/tooltip';
import { ScrollArea } from '../ui/scroll-area';
import { renderNodeInput } from '@/lib/flow/utils';
import { EventTemplate } from '@/lib/events/types';
import SpanTypeIcon from './span-type-icon';

interface SpansTableProps {
  onRowClick?: (traceId: string) => void;
}

export default function SpansTable({ onRowClick }: SpansTableProps) {
  const { projectId } = useProjectContext();
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
  const [spans, setSpans] = useState<Span[] | undefined>(undefined);
  const [totalCount, setTotalCount] = useState<number>(0); // including the filtering
  const [anyInProject, setAnyInProject] = useState<boolean>(true);
  const pageCount = Math.ceil(totalCount / pageSize);
  const [spanId, setSpanId] = useState<string | null>(
    searchParams.get('spanId') ?? null
  );

  const getSpans = async () => {
    setSpans(undefined);

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

    let url = `/api/projects/${projectId}/spans?pageNumber=${pageNumber}&pageSize=${pageSize}`;
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
        'Content-Type': 'application/json'
      }
    });

    const data = (await res.json()) as PaginatedResponse<Span>;

    setSpans(data.items);
    setTotalCount(data.totalCount);
    setAnyInProject(data.anyInProject);
  };
  useEffect(() => {
    getSpans();
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

  const handleRowClick = (row: Span) => {
    searchParams.set('traceId', row.traceId!);
    searchParams.set('spanId', row.spanId);
    router.push(`${pathName}?${searchParams.toString()}`);
    setSpanId(row.spanId);
    onRowClick?.(row.traceId);
  };
  const columns: ColumnDef<Span, any>[] = [
    {
      cell: (row) => <Mono>{row.getValue()}</Mono>,
      header: 'ID',
      accessorFn: (row) => row.spanId.replace(/^00000000-0000-0000-/g, ''),
      id: 'span_id'
    },
    {
      cell: (row) => <Mono>{row.getValue()}</Mono>,
      accessorKey: 'traceId',
      header: 'Trace ID',
      id: 'trace_id'
    },
    {
      accessorKey: 'path',
      header: 'Path',
      id: 'path'
    },
    {
      accessorKey: 'name',
      header: 'Name',
      id: 'name'
    },
    {
      accessorKey: 'spanType',
      header: 'Type',
      id: 'span_type',
      cell: (row) => <div className='flex space-x-2'>
        <SpanTypeIcon className='z-20' spanType={row.getValue()} />
        <div className='flex'>{row.getValue()}</div>
      </div>
    },
    {
      cell: (row) => (
        <TooltipProvider delayDuration={250}>
          <Tooltip>
            <TooltipTrigger className="relative">
              <div
                style={{
                  width: row.column.getSize() - 32
                }}
                className="relative"
              >
                <div className="absolute inset-0 top-[-4px] items-center h-full flex">
                  <div className="text-ellipsis overflow-hidden whitespace-nowrap">
                    {row.getValue()}
                  </div>
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="p-0 border">
              <ScrollArea className="max-h-48 overflow-y-auto p-4">
                <p className="max-w-sm break-words whitespace-pre-wrap">
                  {row.getValue()}
                </p>
              </ScrollArea>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ),
      accessorFn: (row) => renderNodeInput(row.input),
      header: 'Input',
      id: 'input',
      size: 150
    },
    {
      cell: (row) => (
        <TooltipProvider delayDuration={250}>
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
                    {row.getValue()}
                  </div>
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="p-0 border">
              <ScrollArea className="max-h-48 overflow-y-auto p-4">
                <div>
                  <p className="max-w-sm break-words whitespace-pre-wrap">
                    {row.getValue()}
                  </p>
                </div>
              </ScrollArea>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ),
      accessorFn: (row) => renderNodeInput(row.output),
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
      accessorFn: (row) => (row.attributes as Record<string, any>)['gen_ai.usage.input_tokens'],
      header: 'Input tokens',
      id: 'input_token_count'
    },
    {
      accessorFn: (row) => (row.attributes as Record<string, any>)['gen_ai.usage.output_tokens'],
      header: 'Output tokens',
      id: 'output_token_count'
    },
    {
      accessorFn: (row) => (row.attributes as Record<string, any>)['llm.usage.total_tokens'],
      header: 'Total tokens',
      id: 'total_token_count'
    }
  ];

  const extraFilterCols: ColumnDef<Span>[] = [];
  const events: EventTemplate[] = [];
  const labels: LabelClass[] = [];
  // const extraFilterCols = [
  //   {
  //     header: 'events',
  //     id: `event`
  //   },
  //   {
  //     header: 'labels',
  //     id: `label`
  //   }
  // ];

  // const { data: events } = useSWR<EventTemplate[]>(
  //   `/api/projects/${projectId}/event-templates`,
  //   swrFetcher
  // );
  // const { data: labels } = useSWR<LabelClass[]>(
  //   `/api/projects/${projectId}/label-classes`,
  //   swrFetcher
  // );

  const customFilterColumns = {
    event: events?.map((event) => event.name) ?? [],
    label: labels?.map((label) => label.name) ?? []
  };

  const filterColumns = columns
    .filter(
      (column) => !['input', 'output', 'start_time'].includes(column.id!)
    )
    .concat(extraFilterCols);

  return (
    <DataTable
      className="border-none w-full"
      columns={columns}
      data={spans}
      getRowId={(span) => span.spanId}
      onRowClick={(row) => {
        handleRowClick(row.original);
      }}
      paginated
      focusedRowId={spanId}
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
      {/* <TextSearchFilter /> */}
      <DataTableFilter
        columns={filterColumns}
        customFilterColumns={customFilterColumns}
      />
      <DateRangeFilter />
      <Button
        onClick={() => {
          getSpans();
        }}
        variant="outline"
      >
        <RefreshCcw size={16} className="mr-2" />
        Refresh
      </Button>
    </DataTable>
  );
}
