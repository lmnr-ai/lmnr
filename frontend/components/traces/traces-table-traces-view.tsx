import { useProjectContext } from "@/contexts/project-context";
import { useUserContext } from "@/contexts/user-context";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/const";
import { LabelClass, Trace } from "@/lib/traces/types";
import { createClient } from "@supabase/supabase-js";
import { ColumnDef } from "@tanstack/react-table";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useMemo } from "react";
import ClientTimestampFormatter from "../client-timestamp-formatter";
import StatusLabel from "../ui/status-label";
import TracesPagePlaceholder from "./page-placeholder";
import { Event, EventTemplate } from '@/lib/events/types';
import DateRangeFilter from "../ui/date-range-filter";
import { DataTable } from "../ui/datatable";
import DataTableFilter from "../ui/datatable-filter";
import TextSearchFilter from "../ui/text-search-filter";
import { Button } from "../ui/button";
import { RefreshCcw } from "lucide-react";
import { PaginatedResponse } from "@/lib/types";
import Mono from "../ui/mono";
import useSWR from "swr";
import { swrFetcher } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { ScrollArea } from "../ui/scroll-area";
import { renderNodeInput } from "@/lib/flow/utils";

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
      method: "GET",
      headers: {
        "Content-Type": "application/json",
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
      id: 'status',
      size: 100
    },
    {
      cell: (row) => <Mono>{row.getValue()}</Mono>,
      header: 'ID',
      accessorKey: 'id',
      id: 'id',
    },
    {
      accessorKey: 'sessionId',
      header: 'Session ID',
      id: 'session_id',
    },
    {
      cell: (row) => (
        <TooltipProvider delayDuration={250}>
          <Tooltip>
            <TooltipTrigger className="relative">
              <div
                style={{
                  width: row.column.getSize() - 32,
                }}
                className='relative'
              >
                <div className='absolute inset-0 top-[-4px] items-center h-full flex'>
                  <div className='text-ellipsis overflow-hidden whitespace-nowrap'>
                    {row.getValue()}
                  </div>
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="p-0 border">
              <ScrollArea className="max-h-48 overflow-y-auto p-4">
                <p className="max-w-sm break-words whitespace-pre-wrap">{row.getValue()}</p>
              </ScrollArea>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ),
      accessorFn: (row) => renderNodeInput(row.parentSpanInput),
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
                  width: row.column.getSize() - 32,
                }}
                className='relative'
              >
                <div className='absolute inset-0 top-[-4px] items-center h-full flex'>
                  <div className='text-ellipsis overflow-hidden whitespace-nowrap'>

                    {row.getValue()}
                  </div>
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="p-0 border">
              <ScrollArea className="max-h-48 overflow-y-auto p-4">
                <div>
                  <p className="max-w-sm break-words whitespace-pre-wrap">{row.getValue()}</p>
                </div>
              </ScrollArea>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ),
      accessorFn: (row) => renderNodeInput(row.parentSpanOutput),
      header: 'Output',
      id: 'output',
      size: 150
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
      accessorFn: (row) => "$" + row.inputCost?.toFixed(5),
      header: 'Input cost',
      id: 'input_cost'
    },
    {
      accessorFn: (row) => "$" + row.outputCost?.toFixed(5),
      header: 'Output cost',
      id: 'output_cost'
    },
    {
      accessorFn: (row) => "$" + row.cost?.toFixed(5),
      header: 'Cost',
      id: 'cost'
    },
    {
      accessorKey: 'inputTokenCount',
      header: 'Input tokens',
      id: 'input_token_count'
    },
    {
      accessorKey: 'outputTokenCount',
      header: 'Output tokens',
      id: 'output_token_count'
    },
    {
      accessorKey: 'totalTokenCount',
      header: 'Total tokens',
      id: 'total_token_count'
    }
  ];

  const extraFilterCols = [
    {
      header: "events",
      id: `event`,
    },
    {
      header: "labels",
      id: `label`,
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
