import { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "../ui/datatable";
import { RunTrace, TracePreview } from "@/lib/traces/types";
import ClientTimestampFormatter from "../client-timestamp-formatter";
import useSWR from "swr";
import { useProjectContext } from "@/contexts/project-context";
import { swrFetcher } from "@/lib/utils";
import { PipelineVersion } from "@/lib/pipeline/types";
import { use, useEffect, useState } from "react";
import TraceCards from "../traces/trace-cards";
import { ChevronsRight } from "lucide-react";
import StatusLabel from "../ui/status-label";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "../ui/resizable";
import { Skeleton } from "../ui/skeleton";

export const TRACE_COLUMNS: ColumnDef<RunTrace, any>[] = [
  {
    accessorFn: (row) => row.success,
    header: 'Status',
    cell: (row) =>
      <StatusLabel success={row.getValue()} />
    ,
    size: 80
  },
  {
    accessorFn: (row) => {
      return row.startTime
    },
    header: 'Timestamp',
    cell: (row) => <ClientTimestampFormatter timestamp={String(row.getValue())} />,
    size: 140
  },
  {
    accessorFn: (row) => {
      const start = new Date(row.startTime)
      const end = new Date(row.endTime)
      const duration = end.getTime() - start.getTime()

      return `${(duration / 1000).toFixed(2)}s`
    },
    header: 'Latency',
    size: 100
  },
  {
    accessorFn: (row) => row.totalTokenCount,
    header: 'Tokens',
    size: 100
  },
  {
    accessorFn: (row) => (row.approximateCost != null ? `$${row.approximateCost.toFixed(5)}` : 'Unknown'),
    header: 'Cost',
    size: 120
  },
]

interface PipelineHistoryProps {
  pipelineVersion: PipelineVersion,
  onTraceHover?: (nodeId?: string) => void
}

export default function PipelineHistory({ pipelineVersion, onTraceHover }: PipelineHistoryProps) {

  const { projectId } = useProjectContext()

  const columns = TRACE_COLUMNS

  const { data, mutate } = useSWR(`/api/projects/${projectId}/traces/workshop/${pipelineVersion.id}`, swrFetcher)
  const [selectedRunTrace, setSelectedRunTrace] = useState<TracePreview | null>(null)
  const [fullTrace, setFullTrace] = useState<RunTrace | null>(null)
  // useEffect(() => {
  //   if (!selectedRunTrace) {
  //     return;
  //   }
  //   fetch(`/api/projects/${projectId}/traces/trace/${selectedRunTrace?.runId}`).then((res) => res.json()).then((data) => {
  //     setFullTrace(data)
  //   })
  // }, [selectedRunTrace])

  useEffect(() => {
    mutate()
  }, [])

  if (!pipelineVersion.id) {
    return (
      <Skeleton className="w-full h-full" />
    )
  }

  return (
    <div className="flex w-full h-full">
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel>
          {/* <DataTable
            className="border-none rounded-none"
            columns={columns}
            data={data}
            getRowId={(row) => row.runId}
            focusedRowId={selectedRunTrace?.runId}
            onRowClick={(row) => {
              setSelectedRunTrace(row)
            }}
          /> */}
        </ResizablePanel>
        <ResizableHandle />
        {/* {selectedRunTrace && fullTrace && (
          <ResizablePanel>
            <div className="bg-background border-l flex flex-col h-full flex-grow">
              <div className="border-b h-[47px] items-center flex px-2">
                <button
                  className="mr-4"
                  onClick={() => {
                    setSelectedRunTrace(null)
                  }}
                >
                  <ChevronsRight />
                </button>
              </div>
              <TraceCards runTrace={fullTrace!} onTraceHover={onTraceHover} />
            </div>
          </ResizablePanel>
        )} */}
      </ResizablePanelGroup>
    </div>
  )
}