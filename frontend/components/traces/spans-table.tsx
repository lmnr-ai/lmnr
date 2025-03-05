'use client';
import { ColumnDef } from '@tanstack/react-table';
import { ArrowRight, RefreshCcw } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import DeleteSelectedRows from '@/components/ui/DeleteSelectedRows';
import { useProjectContext } from '@/contexts/project-context';
// import { useUserContext } from '@/contexts/user-context';
import { useToast } from '@/lib/hooks/use-toast';
import { Span } from '@/lib/traces/types';
import { DatatableFilter, PaginatedResponse } from '@/lib/types';
import { getFilterFromUrlParams } from '@/lib/utils';

import ClientTimestampFormatter from '../client-timestamp-formatter';
import { Button } from '../ui/button';
import { DataTable } from '../ui/datatable';
import DataTableFilter from '../ui/datatable-filter';
import DateRangeFilter from '../ui/date-range-filter';
// import { Label } from '../ui/label';
import Mono from '../ui/mono';
// import { Switch } from '../ui/switch';
import TextSearchFilter from '../ui/text-search-filter';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '../ui/tooltip';
import SpanTypeIcon from './span-type-icon';

interface SpansTableProps {
  onRowClick?: (traceId: string) => void;
}
const toFilterUrlParam = (filters: DatatableFilter[]): string =>
  JSON.stringify(filters);

const renderCost = (val: any) => {
  if (val == null) {
    return '-';
  }
  return `$${parseFloat(val).toFixed(5) || val}`;
};

const LIVE_UPDATES_STORAGE_KEY = 'spans-live-updates';

export default function SpansTable({ onRowClick }: SpansTableProps) {
  const { projectId } = useProjectContext();
  const searchParams = new URLSearchParams(useSearchParams().toString());
  const pathName = usePathname();
  const router = useRouter();
  const { toast } = useToast();
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
  const pageCount = Math.ceil(totalCount / pageSize);
  const [spanId, setSpanId] = useState<string | null>(
    searchParams.get('spanId') ?? null
  );
  const [enableLiveUpdates, setEnableLiveUpdates] = useState<boolean>(true);
  const isCurrentTimestampIncluded =
    !!pastHours || (!!endDate && new Date(endDate) >= new Date());

  useEffect(() => {
    const stored = globalThis?.localStorage?.getItem(LIVE_UPDATES_STORAGE_KEY);
    setEnableLiveUpdates(stored == null ? true : stored === 'true');
  }, []);

  const spansRef = useRef<Span[] | undefined>(spans);

  // Keep ref updated
  useEffect(() => {
    spansRef.current = spans;
  }, [spans]);

  const [activeFilters, setActiveFilters] = useState<DatatableFilter[]>(
    filter ? (getFilterFromUrlParams(filter) ?? []) : []
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
      url += `&filter=${encodeURIComponent(filter)}`;
    } else if (Array.isArray(filter)) {
      const filters = encodeURIComponent(JSON.stringify(filter));
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

  // const { supabaseClient: supabase } = useUserContext();

  // const dbSpanRowToSpan = (row: Record<string, any>): Span => ({
  //   spanId: row.span_id,
  //   parentSpanId: row.parent_span_id,
  //   traceId: row.trace_id,
  //   spanType: row.span_type,
  //   name: row.name,
  //   path: row.attributes['lmnr.span.path'] ?? "",
  //   startTime: row.start_time,
  //   endTime: row.end_time,
  //   attributes: row.attributes,
  //   input: null,
  //   output: null,
  //   inputPreview: row.input_preview,
  //   outputPreview: row.output_preview,
  //   events: [],
  //   inputUrl: row.input_url,
  //   outputUrl: row.output_url,
  //   model: row.attributes['gen_ai.response.model'] ?? row.attributes['gen_ai.request.model'] ?? null,
  // });

  // const getTrace = async (traceId: string): Promise<Trace> => {
  //   const res = await fetch(`/api/projects/${projectId}/traces/${traceId}`);
  //   const data = await res.json();
  //   return data;
  // };

  // useEffect(() => {
  //   if (!supabase) {
  //     return;
  //   }

  //   if (!enableLiveUpdates) {
  //     supabase.removeAllChannels();
  //     return;
  //   }

  //   supabase.channel('table-db-changes').unsubscribe();

  //   supabase
  //     .channel('table-db-changes')
  //     .on(
  //       'postgres_changes',
  //       {
  //         event: 'INSERT',
  //         schema: 'public',
  //         table: 'spans',
  //         filter: `project_id=eq.${projectId}`
  //       },
  //       (payload) => {
  //         if (payload.eventType === 'INSERT') {
  //           const currentSpans = spansRef.current;
  //           const insertIndex = currentSpans?.findIndex(span => span.startTime <= payload.new.start_time);
  //           const newSpans = currentSpans ? [...currentSpans] : [];
  //           const rtEventSpan = dbSpanRowToSpan(payload.new);
  //           getTrace(rtEventSpan.traceId).then(trace => {
  //             if (trace.traceType !== 'DEFAULT') {
  //               return;
  //             }
  //             newSpans.splice(Math.max(insertIndex ?? 0, 0), 0, rtEventSpan);
  //             if (newSpans.length > pageSize) {
  //               newSpans.splice(pageSize, newSpans.length - pageSize);
  //             }
  //             setSpans(newSpans);
  //             setTotalCount(prev => parseInt(`${prev}`) + 1);
  //           });
  //         }
  //       }
  //     )
  //     .subscribe();

  //   // remove all channels on unmount
  //   return () => {
  //     supabase.removeAllChannels();
  //   };
  // }, []);


  const handleDeleteSpans = async (spanId: string[]) => {
    const response = await fetch(
      `/api/projects/${projectId}/spans?spanId=${spanId.join(',')}`,
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      }
    );

    if (!response.ok) {
      toast({
        title: 'Failed to delete Span',
        variant: 'destructive'
      });
    } else {
      toast({
        title: 'Span deleted',
        description: `Successfully deleted ${spanId.length} Span(s).`
      });
      getSpans();
    }
  };

  // const handleAddFilter = (column: string, value: string) => {
  //   const newFilter = { column, operator: 'eq', value };
  //   const existingFilterIndex = activeFilters.findIndex(
  //     (filter) => filter.column === column && filter.value === value
  //   );

  //   let updatedFilters;
  //   if (existingFilterIndex === -1) {

  //     updatedFilters = [...activeFilters, newFilter];
  //   } else {

  //     updatedFilters = [...activeFilters];
  //   }

  //   setActiveFilters(updatedFilters);
  //   updateUrlWithFilters(updatedFilters);
  // };

  // const updateUrlWithFilters = (filters: DatatableFilter[]) => {
  //   searchParams.delete('filter');
  //   searchParams.delete('pageNumber');
  //   searchParams.append('pageNumber', '0');
  //   searchParams.append('filter', toFilterUrlParam(filters));
  //   router.push(`${pathName}?${searchParams.toString()}`);
  // };


  const handleUpdateFilters = (newFilters: DatatableFilter[]) => {
    setActiveFilters(newFilters);
  };


  const handleRowClick = (row: Span) => {
    searchParams.set('traceId', row.traceId!);
    searchParams.set('spanId', row.spanId);
    router.push(`${pathName}?${searchParams.toString()}`);
    onRowClick?.(row.traceId);
  };

  useEffect(() => {
    setSpanId(searchParams.get('spanId') ?? null);
  }, [searchParams]);

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
      accessorKey: 'spanType',
      header: 'Type',
      id: 'span_type',
      cell: (row) => (
        <div
          // onClick={(event) => {
          //   event.stopPropagation();
          //   handleAddFilter('span_type', row.getValue());
          // }}
          className="cursor-pointer flex space-x-2 items-center hover:underline"
        >
          <SpanTypeIcon className='z-10' spanType={row.getValue()} />
          <div className='flex text-sm'>{row.getValue() === 'DEFAULT' ? 'SPAN' : row.getValue()}</div>
        </div>),
      size: 120
    },
    {
      cell: (row) => (
        <div
          // onClick={(event) => {
          //   event.stopPropagation();
          //   handleAddFilter('name', row.getValue());
          // }}
          className="cursor-pointer hover:underline"
        >
          {row.getValue()}
        </div>
      ),
      accessorKey: 'name',
      header: 'Name',
      id: 'name',
      size: 150
    },
    {
      accessorKey: 'path',
      header: 'Path',
      id: 'path',
      size: 150
    },
    {
      cell: (row) => row.getValue(),
      // <TooltipProvider delayDuration={250}>
      //   <Tooltip>
      //     <TooltipTrigger className="relative">
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
      //         <p className="max-w-sm break-words whitespace-pre-wrap">
      //           {row.getValue()}
      //         </p>
      //       </ScrollArea>
      //     </TooltipContent>
      //   </Tooltip>
      // </TooltipProvider>,
      accessorKey: 'inputPreview',
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
      accessorKey: 'outputPreview',
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
      accessorFn: (row) => (row.attributes as Record<string, any>)['llm.usage.total_tokens'],
      header: 'Tokens',
      id: 'tokens',
      cell: (row) => {
        if (row.getValue()) {
          return <div className='flex items-center'>
            {`${row.row.original.attributes['gen_ai.usage.input_tokens'] ?? '-'}`}
            <ArrowRight size={12} className='mx-1 min-w-[12px]' />
            {`${row.row.original.attributes['gen_ai.usage.output_tokens'] ?? '-'}`}
            {` (${row.getValue() ?? '-'})`}
          </div>;
        }
        return <div className='flex items-center'></div>;
      },
      size: 150
    },
    {
      accessorFn: (row) => (row.attributes as Record<string, any>)['gen_ai.usage.cost'],
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
                    <span>{renderCost(row.row.original.attributes['gen_ai.usage.input_cost'])}</span>
                  </div>
                  <div className='flex justify-between space-x-2'>
                    <span>Output cost</span>
                    <span>{renderCost(row.row.original.attributes['gen_ai.usage.output_cost'])}</span>
                  </div>
                </div>
              </TooltipContent>
            }
          </Tooltip>
        </TooltipProvider>,
      size: 100
    },
    {
      header: 'Model',
      accessorKey: 'model',
      id: 'model'
    }
  ];


  const filterColumns = [
    {
      id: 'id',
      name: 'ID'
    },
    {
      id: 'trace_id',
      name: 'Trace ID'
    },
    {
      id: 'span_type',
      name: 'Type'
    },
    {
      id: 'name',
      name: 'Name'
    },
    {
      id: 'path',
      name: 'Path'
    },
    {
      id: 'latency',
      name: 'Latency'
    },
    {
      id: 'tokens',
      name: 'Tokens'
    },
    {
      id: 'cost',
      name: 'Cost'
    },
    {
      id: 'labels',
      name: 'Labels',
      restrictOperators: ['eq'],
    },
    {
      id: 'model',
      name: 'Model',
    }

  ];

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
      selectionPanel={(selectedRowIds) => (
        <div className="flex flex-col space-y-2">
          <DeleteSelectedRows
            selectedRowIds={selectedRowIds}
            onDelete={handleDeleteSpans}
            entityName="spans"
          />
        </div>
      )}
    >
      <TextSearchFilter />
      <DataTableFilter
        possibleFilters={filterColumns} activeFilters={activeFilters} updateFilters={handleUpdateFilters}
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
      {/* <div className="flex items-center space-x-2">
        <Switch
          checked={enableLiveUpdates}
          onCheckedChange={(checked) => {
            setEnableLiveUpdates(checked);
            localStorage.setItem(LIVE_UPDATES_STORAGE_KEY, checked.toString());
          }}
        />
        <Label>Live</Label>
      </div> */}
    </DataTable>
  );
}
