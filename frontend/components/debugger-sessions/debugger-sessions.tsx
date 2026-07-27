"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { useParams } from "next/navigation";
import { useEffect } from "react";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
import { DebuggerSessionsChrome } from "@/components/debugger-sessions/chrome";
import { DebuggerSessionsGrid } from "@/components/debugger-sessions/grid";
import CopyTooltip from "@/components/ui/copy-tooltip";
import { InfiniteDataTableProvider } from "@/components/ui/infinite-datatable/model/table-store";
import Mono from "@/components/ui/mono";
import { type DebuggerSession } from "@/lib/actions/debugger-sessions";
import { track } from "@/lib/posthog";

const RESOURCE = "debugger-sessions";

const columns: ColumnDef<DebuggerSession>[] = [
  {
    cell: ({ row }) => (
      <CopyTooltip value={row.original.id} className="block truncate">
        <Mono className="text-xs text-muted-foreground">{row.original.id}</Mono>
      </CopyTooltip>
    ),
    size: 120,
    header: "ID",
    id: "id",
  },
  {
    cell: ({ row }) => (
      <div title={row.original.name ?? "-"} className="text-sm truncate">
        {row.original.name ?? "-"}
      </div>
    ),
    header: "Name",
    id: "name",
  },
  {
    header: "Traces",
    accessorKey: "traceCount",
    cell: ({ row }) => <Mono className="text-xs">{row.original.traceCount}</Mono>,
    id: "traceCount",
    size: 100,
  },
  {
    header: "Evals",
    accessorKey: "evalCount",
    cell: ({ row }) => <Mono className="text-xs">{row.original.evalCount}</Mono>,
    id: "evalCount",
    size: 100,
  },
  {
    header: "Last activity",
    accessorKey: "lastActivity",
    cell: ({ row }) =>
      row.original.lastActivity ? (
        <ClientTimestampFormatter timestamp={row.original.lastActivity} />
      ) : (
        <span className="text-muted-foreground">-</span>
      ),
    id: "lastActivity",
    size: 180,
  },
  {
    header: "Created",
    accessorKey: "createdAt",
    cell: (row) => <ClientTimestampFormatter timestamp={String(row.getValue())} />,
    id: "createdAt",
    size: 180,
  },
];

const defaultDebuggerSessionsColumnOrder = ["id", "name", "traceCount", "evalCount", "lastActivity", "createdAt"];

function DebuggerSessionsContent() {
  const { projectId } = useParams();

  useEffect(() => {
    track("debugger_sessions", "page_viewed");
  }, []);

  const chrome = (
    <DebuggerSessionsChrome
      projectId={String(projectId)}
      columnLabels={columns.map((column) => ({
        id: column.id!,
        label: typeof column.header === "string" ? column.header : column.id!,
      }))}
    />
  );

  return <DebuggerSessionsGrid chrome={chrome} columns={columns} />;
}

export default function DebuggerSessions() {
  const { projectId } = useParams();
  return (
    <InfiniteDataTableProvider
      defaults={{ columnOrder: defaultDebuggerSessionsColumnOrder }}
      views={{ projectId: String(projectId), resource: RESOURCE }}
    >
      <DebuggerSessionsContent />
    </InfiniteDataTableProvider>
  );
}
