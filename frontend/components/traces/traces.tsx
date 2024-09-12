'use client';

import { useState, useEffect, useMemo } from 'react';
import TraceView from './trace-view';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { DataTable } from '../ui/datatable';
import { Trace } from '@/lib/traces/types';
import { ColumnDef } from '@tanstack/react-table';
import ClientTimestampFormatter from '../client-timestamp-formatter';
import { Resizable } from 're-resizable';
import StatusLabel from '../ui/status-label';
import { Event } from '@/lib/events/types';
import TracesMetrics from './traces-metrics';
import TracesPagePlaceholder from './page-placeholder';
import { useUserContext } from '@/contexts/user-context';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL, USE_REALTIME } from '@/lib/const';
import { useProjectContext } from '@/contexts/project-context';
import { usePrevious } from '@/lib/hooks/use-previous';

interface TracesProps {
  defaultTraces: Trace[];
  totalTracesCount: number;
  pageCount: number;
  pageSize: number;
  pageNumber: number;
  defaultSelectedid?: string;
  totalInProject: number | null;
  enableStreaming: boolean;
}

export default function Traces({
  defaultTraces,
  totalTracesCount,
  pageCount,
  pageSize,
  pageNumber,
  defaultSelectedid,
  totalInProject,
  enableStreaming,
}: TracesProps) {
  const searchParams = new URLSearchParams(useSearchParams().toString());
  const pathName = usePathname();
  const router = useRouter();
  const [expandedid, setExpandedid] = useState<string | null>(defaultSelectedid ?? null);
  const [traces, setTraces] = useState<Trace[]>(defaultTraces);
  const [isSidePanelOpen, setIsSidePanelOpen] = useState<boolean>(defaultSelectedid != null);
  const { projectId } = useProjectContext();
  const [isDefaultTracesMounted, setIsDefaultTracesMounted] = useState<boolean>(false);

  const [totalCount, setTotalCount] = useState<number>(totalTracesCount);  // including the filtering
  const [totalInProjectCount, setTotalInProjectCount] = useState<number>(totalInProject ?? 0);

  const handleRowClick = async (row: Trace) => {
    setExpandedid(row.id);
    searchParams.set('selectedid', row.id!);
    router.push(`${pathName}?${searchParams.toString()}`);
    setIsSidePanelOpen(true);
  };

  useEffect(() => {
    const selectedid = searchParams.get('selectedid');
    if (selectedid != null) {
      setExpandedid(selectedid);
      setIsSidePanelOpen(true);
    }
  }, []);

  const staticColumns: ColumnDef<Trace, any>[] = [
    {
      accessorFn: (row) => row.success ? 'Success' : 'Failed',
      header: 'Status',
      cell: (row) => {
        return <StatusLabel success={row.getValue() === 'Success'} />
      },
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
      accessorFn: (row) => {
        return row.startTime
      },
      header: 'Timestamp',
      cell: (row) => <ClientTimestampFormatter timestamp={String(row.getValue())} />,
      id: 'start_time'
    },
    {
      accessorFn: (row) => {
        const start = new Date(row.startTime)
        const end = new Date(row.endTime)
        const duration = end.getTime() - start.getTime()

        return `${(duration / 1000).toFixed(2)}s`
      },
      header: 'Latency',
      id: 'latency'
    },
    {
      accessorFn: (row) => {
        return "$" + row.cost?.toFixed(5)
      },
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
            {eventNames.map((eventName, index) => {
              return (
                <div key={index} className='flex items-center rounded p-0.5 border text-xs text-secondary-foreground px-2 bg-secondary'>
                  <span>{eventName}</span>
                </div>
              )
            })}
          </div>
        )
      },
      header: 'events',
    }

  ]

  const eventFilterCol = {
    header: "events",
    id: `jsonb::events::event`,
  };

  const metadata_keys = new Set<string>();
  defaultTraces.forEach((trace) => {
    Object.keys(trace.metadata ?? {}).forEach((key) => {
      metadata_keys.add(key);
    });
  });

  const columns = staticColumns

  const { supabaseAccessToken } = useUserContext()
  const supabase = useMemo(() => {
    return USE_REALTIME
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
    : null
  }, [])

  supabase?.realtime.setAuth(supabaseAccessToken)

  useEffect(() => {
    // When enableStreaming changes, need to remove all channels and, if enabled, re-subscribe
    supabase?.channel('table-db-changes').unsubscribe()

    if (enableStreaming) {
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
              fetch(`/api/projects/${projectId}/traces/${payload.new.id}/trace-with-events`).then((res) => res.json()).then((newTrace) => {
                // TODO: Update total count and total in project
                setTraces((prevTraces) => {
                  return [newTrace, ...prevTraces];
                })
                setTotalCount((prevTotalCount) => prevTotalCount + 1);
                setTotalInProjectCount((prevTotalInProjectCount) => prevTotalInProjectCount + 1);
              });
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
              fetch(`/api/projects/${projectId}/traces/${payload.new.id}/trace-with-events`).then((res) => res.json()).then((updatedTrace) => {
                setTraces((prevTraces) => {
                  const updatedTraces = prevTraces.map((trace) => {
                    if (trace.id === updatedTrace.id) {
                      return updatedTrace;
                    }
                    return trace;
                  });

                  return updatedTraces;
                })
              });
            }
          }
        )
        .subscribe()
    }

    // remove all channels on unmount
    return () => {
      supabase?.removeAllChannels()
    }
  }, [enableStreaming])

  useEffect(() => {
    setTraces(defaultTraces)
  }, [defaultTraces]);

  const prevPageSize = usePrevious(pageSize);
  const prevPageNumber = usePrevious(pageNumber);

  useEffect(() => {
    let isMounted = isDefaultTracesMounted;

    if (pageSize !== prevPageSize || pageNumber !== prevPageNumber) {
      setIsDefaultTracesMounted(false)
      isMounted = false;
    }

    if (isMounted && enableStreaming) {
      return;
    }

    setIsDefaultTracesMounted(true)
    setTraces(defaultTraces ?? [])
  }, [defaultTraces]);

  useEffect(() => {
    setTotalCount(totalTracesCount);
    setTotalInProjectCount(totalInProject ?? 0);
  }, [totalTracesCount, totalInProject])


  if (totalCount === 0 && totalInProjectCount === 0) {
    return <TracesPagePlaceholder />
  }


  return (
    <div className="h-full flex flex-col">
      <div className="flex flex-col w-full h-full relative">
        <div className='flex-none'>
          <TracesMetrics
          />
        </div>
        <div className='flex-grow'>
          <DataTable
            className='border-none'
            columns={columns}
            data={traces}
            getRowId={(trace) => trace.id}
            onRowClick={async (row) => await handleRowClick(row)}
            paginated
            focusedRowId={expandedid}
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
            filterColumns={
              columns.filter(column => !['actions', 'events', 'start_time'].includes(column.id!)).concat([eventFilterCol])
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
                <TraceView
                  onClose={() => {
                    searchParams.delete('selectedid');
                    router.push(`${pathName}?${searchParams.toString()}`);
                    setIsSidePanelOpen(false)
                    setExpandedid(null);
                  }}
                  traceId={expandedid!}
                />

              </div>
            </Resizable>
          </div>
        )}
      </div>
    </div >
  )
}