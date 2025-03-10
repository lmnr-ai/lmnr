import { ColumnDef } from '@tanstack/react-table';
import { ArrowRight, RefreshCcw } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import DeleteSelectedRows from '@/components/ui/DeleteSelectedRows';
import { useProjectContext } from '@/contexts/project-context';
import { useUserContext } from '@/contexts/user-context';
import { useToast } from '@/lib/hooks/use-toast';
import { Trace } from '@/lib/traces/types';
import { DatatableFilter, PaginatedResponse } from '@/lib/types';
import { getFilterFromUrlParams } from '@/lib/utils';

import ClientTimestampFormatter from '../client-timestamp-formatter';
import { Button } from '../ui/button';
import { DataTable } from '../ui/datatable';
import DataTableFilter from '../ui/datatable-filter';
import DateRangeFilter from '../ui/date-range-filter';
import Mono from '../ui/mono';
import TextSearchFilter from '../ui/text-search-filter';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '../ui/tooltip';
import SpanTypeIcon from './span-type-icon';

interface TracesTableProps {
  onRowClick?: (rowId: string) => void;
}
const toFilterUrlParam = (filters: DatatableFilter[]): string =>
  JSON.stringify(filters);

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
  const { projectId } = useProjectContext();
  const [traces, setTraces] = useState<Trace[] | undefined>(undefined);
  const [totalCount, setTotalCount] = useState<number>(0); // including the filtering
  const [canRefresh, setCanRefresh] = useState<boolean>(false);
  const pageCount = Math.ceil(totalCount / pageSize);
  const [traceId, setTraceId] = useState<string | null>(
    searchParams.get('traceId') ?? null
  );

  const [activeFilters, setActiveFilters] = useState<DatatableFilter[]>(
    filter ? (getFilterFromUrlParams(filter) ?? []) : []
  );

  const isCurrentTimestampIncluded =
    !!pastHours || (!!endDate && new Date(endDate) >= new Date());

  const getTraces = async () => {
    let queryFilter = searchParams.get('filter');
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

    const data = (await res.json()) as PaginatedResponse<Trace>;

    setTraces(data.items);
    setTotalCount(data.totalCount);
  };

  useEffect(() => {
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

  const handleDeleteTraces = async (traceId: string[]) => {
    const response = await fetch(
      `/api/projects/${projectId}/traces?traceId=${traceId.join(',')}`,
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      }
    );

    if (!response.ok) {
      toast({
        title: 'Failed to delete traces',
        variant: 'destructive'
      });
    } else {
      toast({
        title: 'Traces deleted',
        description: `Successfully deleted ${traceId.length} trace(s).`
      });
      // mutate();
      getTraces();
    }
  };

  const handleAddFilter = (column: string, value: string) => {
    const newFilter = { column, operator: 'eq', value };
    const existingFilterIndex = activeFilters.findIndex(
      (filter) => filter.column === column && filter.value === value
    );

    let updatedFilters;
    if (existingFilterIndex === -1) {

      updatedFilters = [...activeFilters, newFilter];
    } else {

      updatedFilters = [...activeFilters];
    }

    setActiveFilters(updatedFilters);
    updateUrlWithFilters(updatedFilters);
  };

  const updateUrlWithFilters = (filters: DatatableFilter[]) => {
    searchParams.delete('filter');
    searchParams.delete('pageNumber');
    searchParams.append('pageNumber', '0');
    searchParams.append('filter', toFilterUrlParam(filters));
    router.push(`${pathName}?${searchParams.toString()}`);
  };

  const handleUpdateFilters = (newFilters: DatatableFilter[]) => {
    setActiveFilters(newFilters);
  };

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
      cell: (row) => (
        <div
          onClick={(event) => {
            event.stopPropagation();
            handleAddFilter('span_type', row.getValue());
          }}
          className="cursor-pointer flex gap-2 items-center hover:bg-secondary"
        >
          <div className=''>
            <SpanTypeIcon className='z-10' spanType={row.getValue()} />
          </div>
          <div className='flex text-sm text-ellipsis overflow-hidden whitespace-nowrap'>{row.row.original.topSpanName}</div>
        </div>),
      size: 150
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
    {
      accessorFn: (row) => row.metadata ? JSON.stringify(row.metadata, null, 2) : '',
      header: 'Metadata',
      id: 'metadata',
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
                    {row.getValue()}
                  </div>
                </div>
              </div>
            </TooltipTrigger>
            {row.getValue() != undefined &&
              <TooltipContent side="bottom" className="p-2 border">
                <div className='whitespace-pre-wrap'>
                  {row.getValue()}
                </div>
              </TooltipContent>
            }
          </Tooltip>
        </TooltipProvider>,
      size: 100
    },
  ];

  const { supabaseClient: supabase } = useUserContext();

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

  const filters = [
    {
      name: 'ID',
      id: 'id',
    },
    {
      name: 'Latency',
      id: 'latency',
    },
    // TODO: alias span_type and name to top_span_type and top_span_name in
    // the DB query
    {
      name: 'Top level span',
      id: 'span_type',
      restrictOperators: ['eq']
    },
    {
      name: 'Top span name',
      id: 'name',
    },
    {
      name: 'Input cost',
      id: 'input_cost',
    },
    {
      name: 'Output cost',
      id: 'output_cost',
    },
    {
      name: 'Metadata',
      id: 'metadata',
      restrictOperators: ['eq']
    },
    {
      name: 'Labels',
      id: 'labels',
      restrictOperators: ['eq']
    }
  ];

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
      selectionPanel={(selectedRowIds) => (
        <div className="flex flex-col space-y-2">
          <DeleteSelectedRows
            selectedRowIds={selectedRowIds}
            onDelete={handleDeleteTraces}
            entityName="traces"
          />
        </div>
      )}
    >
      <TextSearchFilter />
      <DataTableFilter
        possibleFilters={filters} activeFilters={activeFilters} updateFilters={handleUpdateFilters}
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
