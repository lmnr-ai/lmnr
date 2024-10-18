'use client';

import { SessionPreview, Trace } from '@/lib/traces/types';
import { ColumnDef } from '@tanstack/react-table';
import ClientTimestampFormatter from '../client-timestamp-formatter';
import { DataTable } from '../ui/datatable';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import DataTableFilter from '../ui/datatable-filter';
import DateRangeFilter from '../ui/date-range-filter';
import { useProjectContext } from '@/contexts/project-context';
import { useEffect, useState } from 'react';
import TextSearchFilter from '../ui/text-search-filter';
import { ChevronDownIcon, ChevronRightIcon, RefreshCcw } from 'lucide-react';
import { getDuration, getDurationString } from '@/lib/flow/utils';
import { Button } from '../ui/button';
import { PaginatedResponse } from '@/lib/types';

type SessionRow = {
  type: string;
  data: SessionPreview | Trace;
  subRows: SessionRow[];
};

interface SessionsTableProps {
  onRowClick?: (rowId: string) => void;
}

export default function SessionsTable({ onRowClick }: SessionsTableProps) {
  const { projectId } = useProjectContext();
  const searchParams = new URLSearchParams(useSearchParams().toString());
  const pathName = usePathname();
  const router = useRouter();

  const [focusedRowId, setFocusedRowId] = useState<string | undefined>(
    undefined
  );
  const [sessions, setSessions] = useState<SessionRow[] | undefined>(undefined);

  const defaultPageNumber = searchParams.get('pageNumber') ?? '0';
  const defaultPageSize = searchParams.get('pageSize') ?? '50';
  const [totalCount, setTotalCount] = useState<number>(0);
  const pageNumber = parseInt(searchParams.get('pageNumber') ?? '0');
  const pageSize = Math.max(parseInt(defaultPageSize), 1);
  const pageCount = Math.ceil(totalCount / pageSize);
  const filter = searchParams.get('filter');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const pastHours = searchParams.get('pastHours');
  const textSearchFilter = searchParams.get('search');

  const getSessions = async () => {
    setSessions(undefined);

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

    let url = `/api/projects/${projectId}/sessions?pageNumber=${pageNumber}&pageSize=${pageSize}`;
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
    const data = (await res.json()) as PaginatedResponse<SessionPreview>;

    setSessions(
      data.items.map((s) => ({
        type: 'session',
        data: s,
        subRows: []
      }))
    );

    setTotalCount(data.totalCount);
  };

  useEffect(() => {
    getSessions();
  }, [
    pageSize,
    defaultPageNumber,
    projectId,
    filter,
    pastHours,
    startDate,
    endDate,
    textSearchFilter
  ]);

  const columns: ColumnDef<SessionRow, any>[] = [
    {
      header: 'Type',
      cell: ({ row }) =>
        row.original.type === 'session' ? (
          <div className="flex items-center gap-2">
            <span className="">Session</span>
            {row.getIsExpanded() ? (
              <ChevronDownIcon className="w-4 text-secondary-foreground" />
            ) : (
              <ChevronRightIcon className="w-4 text-secondary-foreground" />
            )}
          </div>
        ) : (
          <div>
            <span className="text-gray-500">Trace</span>
          </div>
        ),
      id: 'type'
    },
    {
      accessorFn: (row) => (row.data.id === null ? '-' : row.data.id),
      header: 'ID',
      id: 'id'
    },
    {
      accessorFn: (row) => row.data.startTime,
      header: 'Start time',
      cell: (row) => (
        <ClientTimestampFormatter timestamp={String(row.getValue())} />
      ),
      id: 'start_time'
    },
    {
      accessorFn: (row) => {
        if (row.type === 'trace') {
          return getDurationString(row.data.startTime, row.data.endTime);
        }

        return (row.data as SessionPreview).duration.toFixed(3) + 's';
      },
      header: 'Duration'
    },
    {
      accessorFn: (row) => '$' + row.data.inputCost?.toFixed(5),
      header: 'Input cost',
      id: 'input_cost'
    },
    {
      accessorFn: (row) => '$' + row.data.outputCost?.toFixed(5),
      header: 'Output cost',
      id: 'output_cost'
    },
    {
      accessorFn: (row) => '$' + row.data.cost?.toFixed(5),
      header: 'Total cost',
      id: 'cost'
    },
    {
      accessorFn: (row) => row.data.inputTokenCount,
      header: 'Input token count',
      id: 'input_token_count'
    },
    {
      accessorFn: (row) => row.data.outputTokenCount,
      header: 'Output token count',
      id: 'output_token_count'
    },
    {
      accessorFn: (row) => row.data.totalTokenCount,
      header: 'Token count',
      id: 'total_token_count'
    },
    {
      accessorFn: (row) => (row.data as SessionPreview).traceCount,
      header: 'Trace Count',
      id: 'trace_count'
    }
  ];

  const filterColumns = columns.filter(
    (column) => !['type', 'ent_time', 'start_time'].includes(column.id!)
  );

  return (
    <DataTable
      className="border-none w-full"
      columns={columns}
      data={sessions}
      getRowId={(row) => row.data.id}
      onRowClick={async (row) => {
        if (row.original.type === 'trace') {
          setFocusedRowId(row.original.data.id);
          onRowClick?.(row.original.data.id);

          searchParams.set('selectedId', row.original.data.id);
          router.push(`${pathName}?${searchParams.toString()}`);
          return;
        }

        row.toggleExpanded();

        const filter = [
          {
            column: 'session_id',
            value: row.original.data.id,
            operator: 'eq'
          }
        ];

        const res = await fetch(
          `/api/projects/${projectId}/traces?pageNumber=0&pageSize=50&filter=${encodeURI(JSON.stringify(filter))}`,
          {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json'
            }
          }
        );
        const traces = (await res.json()) as PaginatedResponse<Trace>;
        setSessions((sessions) =>
          sessions?.map((s) => {
            if (s.data.id === row.original.data.id) {
              return {
                ...s,
                type: 'session',
                subRows: traces.items
                  .map((t) => ({
                    type: 'trace',
                    data: t,
                    subRows: []
                  }))
                  .toReversed()
              };
            } else {
              return s;
            }
          })
        );
      }}
      paginated
      focusedRowId={focusedRowId}
      pageCount={pageCount}
      defaultPageSize={pageSize}
      defaultPageNumber={parseInt(defaultPageNumber)}
      onPageChange={(pageNumber, pageSize) => {
        searchParams.set('pageNumber', pageNumber.toString());
        searchParams.set('pageSize', pageSize.toString());
        router.push(`${pathName}?${searchParams.toString()}`);
      }}
      manualPagination
      totalItemsCount={totalCount}
      enableRowSelection
    >
      <TextSearchFilter />
      <DataTableFilter columns={filterColumns} />
      <DateRangeFilter />
      <Button
        onClick={() => {
          getSessions();
        }}
        variant="outline"
      >
        <RefreshCcw size={16} className="mr-2" />
        Refresh
      </Button>
    </DataTable>
  );
}
