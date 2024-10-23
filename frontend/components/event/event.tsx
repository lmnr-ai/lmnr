'use client';

import { ColumnDef } from '@tanstack/react-table';
import { useEffect, useState } from 'react';
import { DataTable } from '../ui/datatable';
import { useProjectContext } from '@/contexts/project-context';
import Header from '../ui/header';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { formatTimestampFromSeconds } from '@/lib/utils';
import { Event, EventTemplate } from '@/lib/events/types';
import { Label } from '../ui/label';

import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent
} from '@/components/ui/chart';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import DateRangeFilter from '../ui/date-range-filter';
import DataTableFilter from '../ui/datatable-filter';
import ClientTimestampFormatter from '../client-timestamp-formatter';
import { Resizable } from 're-resizable';
import EventView from './event-view';
import { PaginatedResponse } from '@/lib/types';

// TODO: add refresh button on realtime updates. See components/traces/traces-table-traces-view.tsx for an example.

const getEvents = async (
  projectId: string,
  templateId: string,
  pageNumber: number,
  pageSize: number,
  filter: string | string[] | undefined,
  pastHours: string | null,
  startDate: string | null | undefined,
  endDate: string | null | undefined
): Promise<PaginatedResponse<Event>> => {
  let url = `/api/projects/${projectId}/event-templates/${templateId}/events?pageNumber=${pageNumber}&pageSize=${pageSize}`;
  if (pastHours !== null) {
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
    const filters = encodeURIComponent(`[${filter.toString()}]`);
    url += `&filter=${filters}`;
  }
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    },
    cache: 'no-cache'
  });
  return (await res.json()) as PaginatedResponse<Event>;
};

interface EventProps {
  eventTemplate: EventTemplate;
  metrics: { [key: string]: { [key: string]: number }[] };
}

export default function EventComponent({ eventTemplate, metrics }: EventProps) {
  const router = useRouter();
  const pathName = usePathname();
  const searchParams = new URLSearchParams(useSearchParams().toString());
  const { projectId } = useProjectContext();

  const parseNumericSearchParam = (
    key: string,
    defaultValue: number
  ): number => {
    const param = searchParams.get(key);
    if (Array.isArray(param)) {
      return defaultValue;
    }
    const parsed = param ? parseInt(param as string) : defaultValue;
    return isNaN(parsed) ? defaultValue : parsed;
  };

  const pageNumber = parseNumericSearchParam('pageNumber', 0);
  const pageSize = Math.max(parseNumericSearchParam('pageSize', 50), 1);
  const filter = searchParams.get('filter');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const pastHours = searchParams.get('pastHours');

  const [isSidePanelOpen, setIsSidePanelOpen] = useState<boolean>(false);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [events, setEvents] = useState<Event[] | undefined>(undefined);
  const [totalCount, setTotalCount] = useState<number>(0); // including the filtering
  const [anyInProject, setAnyInProject] = useState<boolean>(true);

  const pageCount = Math.ceil(totalCount / pageSize);

  const handleRowClick = (row: Event) => {
    setSelectedEvent(row);
    setIsSidePanelOpen(true);
  };

  useEffect(() => {
    setEvents(undefined);

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

    getEvents(
      projectId,
      eventTemplate.id,
      pageNumber,
      pageSize,
      filter ?? undefined,
      pastHours,
      startDate,
      endDate
    )
      .then((result) => {
        console.log(result);
        setEvents(result.items);
        setTotalCount(result.totalCount);
        setAnyInProject(result.anyInProject);
      })
      .catch((err) => {
        console.error(err);
      });
  }, [
    projectId,
    pageNumber,
    pageSize,
    filter,
    pastHours,
    startDate,
    endDate,
    eventTemplate.id
  ]);

  const columns: ColumnDef<Event>[] = [
    {
      accessorKey: 'id',
      header: 'ID',
      id: 'id'
    },
    {
      header: 'Occurrence',
      accessorKey: 'createdAt',
      id: 'created_at',
      cell: (row) => (
        <ClientTimestampFormatter timestamp={String(row.getValue())} />
      )
    },
    {
      accessorFn: (row) => row.spanId.replace(/^00000000-0000-0000-/g, ''),
      header: 'Span ID',
      id: 'span_id'
    },
    {
      accessorKey: 'value',
      header: 'Value',
      id: 'value'
    }
  ];

  return (
    <div className="h-full w-full flex flex-col">
      <Header path={`events/${eventTemplate.name}`} />
      <div className="flex flex-col h-full">
        <div className="flex-none flex w-full">
          <div className="min-w-96 w-96 flex-none p-4 flex flex-col space-y-4 items-start">
            <p className="text-2xl font-bold">{eventTemplate.name}</p>
            <div className="flex space-x-2 w-full">
              <div className="flex flex-grow">
                <Label className="p-2 border rounded">
                  {eventTemplate.eventType}
                </Label>
              </div>
            </div>
          </div>
          <div className="flex-grow p-4">
            <CustomChart
              data={metrics}
              title="Total Count"
              xAxisKey="time"
              yAxisKey="value"
            />
          </div>
        </div>
        <div className="flex-grow flex flex-col">
          <DataTable
            className="border-none"
            columns={columns}
            data={events}
            onRowClick={async (row) => handleRowClick(row.original)}
            paginated
            focusedRowId={selectedEvent?.id}
            manualPagination
            pageCount={pageCount}
            defaultPageNumber={pageNumber}
            defaultPageSize={pageSize}
            onPageChange={(pageNumber, pageSize) => {
              searchParams.set('pageNumber', pageNumber.toString());
              searchParams.set('pageSize', pageSize.toString());
              router.push(`${pathName}?${searchParams.toString()}`);
            }}
            totalItemsCount={totalCount}
          >
            <DataTableFilter
              columns={columns.filter((col) => col.id !== 'created_at')}
            />
            <DateRangeFilter />
          </DataTable>
        </div>
        {isSidePanelOpen && (
          <div className="absolute top-0 right-0 bottom-0 bg-background border-l z-50 flex">
            <Resizable
              enable={{
                top: false,
                right: false,
                bottom: false,
                left: true,
                topRight: false,
                bottomRight: false,
                bottomLeft: false,
                topLeft: false
              }}
              defaultSize={{
                width: 800
              }}
            >
              <div className="w-full h-full flex">
                <EventView
                  onClose={() => {
                    //   searchParams.delete('selectedid');
                    //   router.push(`${pathName}?${searchParams.toString()}`);
                    setIsSidePanelOpen(false);
                    //   setExpandedid(null);
                  }}
                  event={selectedEvent!}
                />
              </div>
            </Resizable>
          </div>
        )}
      </div>
    </div>
  );
}

interface CustomChartProps {
  data: any;
  title: string;
  xAxisKey: string;
  yAxisKey: string;
  className?: string;
}

function CustomChart({
  data,
  title,
  xAxisKey,
  yAxisKey,
  className
}: CustomChartProps) {
  const chartConfig = {
    [xAxisKey]: {
      color: 'hsl(var(--chart-2))'
    }
  } satisfies ChartConfig;

  return (
    <div className="">
      <div className="text-sm font-medium text-secondary-foreground">
        {title}
      </div>
      <div className="">
        <ChartContainer config={chartConfig} className="max-h-48 w-full">
          <LineChart
            accessibilityLayer
            data={data}
            margin={{ top: 10, right: 10, bottom: 0, left: 0 }}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              type="number"
              domain={['dataMin', 'dataMax']}
              tickLine={false}
              tickFormatter={formatTimestampFromSeconds}
              axisLine={false}
              tickMargin={10}
              dataKey={xAxisKey}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickCount={4}
              tickMargin={20}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  labelKey={xAxisKey}
                  labelFormatter={(label, p) =>
                    formatTimestampFromSeconds(p[0].payload[xAxisKey])
                  }
                />
              }
            />
            <Line dataKey={yAxisKey} dot={false} fill="hsl(var(--chart-1))" />
          </LineChart>
        </ChartContainer>
      </div>
    </div>
  );
}
