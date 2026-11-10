import { type ColumnDef } from "@tanstack/react-table";
import { type ReactNode } from "react";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
import Mono from "@/components/ui/mono";
import { type AuditLogEvent } from "@/lib/actions/audit-log/types";
import { cn } from "@/lib/utils";

import { sourceLabel } from "./constants";

const outcomeClass: Record<AuditLogEvent["outcome"], string> = {
  success: "text-secondary-foreground",
  denied: "text-destructive",
  error: "text-orange-400",
};

const Empty = () => <span className="text-muted-foreground">—</span>;

const Cell = ({ children, title }: { children: ReactNode; title?: string }) =>
  children ? (
    <span className="truncate" title={title}>
      {children}
    </span>
  ) : (
    <Empty />
  );

export const columns: ColumnDef<AuditLogEvent>[] = [
  {
    id: "timestamp",
    header: "Time",
    size: 160,
    cell: ({ row }) => <ClientTimestampFormatter absolute timestamp={row.original.timestamp} />,
  },
  {
    id: "project",
    header: "Project",
    size: 140,
    cell: ({ row }) => <Cell>{row.original.projectName}</Cell>,
  },
  {
    id: "actor",
    header: "Actor",
    size: 200,
    cell: ({ row }) => (
      <Cell title={row.original.actorOwnerLabel ? `Created by ${row.original.actorOwnerLabel}` : undefined}>
        {row.original.actorType === "api_key" ? "API key " : ""}
        {row.original.actorLabel || row.original.actorId}
      </Cell>
    ),
  },
  {
    id: "actorRole",
    header: "Actor role",
    size: 100,
    cell: ({ row }) => <Cell>{row.original.actorRole}</Cell>,
  },
  {
    id: "resource",
    header: "Resource",
    size: 130,
    cell: ({ row }) => <Mono>{row.original.resourceType}</Mono>,
  },
  {
    id: "action",
    header: "Action",
    size: 120,
    cell: ({ row }) => <Mono>{row.original.action}</Mono>,
  },
  {
    id: "resourceName",
    header: "Resource name",
    size: 200,
    cell: ({ row }) => <Cell>{row.original.resourceLabel}</Cell>,
  },
  {
    id: "resourceId",
    header: "Resource ID",
    size: 200,
    cell: ({ row }) => <Cell>{row.original.resourceId && <Mono>{row.original.resourceId}</Mono>}</Cell>,
  },
  {
    id: "source",
    header: "Source",
    size: 80,
    cell: ({ row }) => sourceLabel(row.original.source),
  },
  {
    id: "outcome",
    header: "Outcome",
    size: 90,
    cell: ({ row }) => <span className={cn(outcomeClass[row.original.outcome])}>{row.original.outcome}</span>,
  },
];

export const columnLabels = columns.map((column) => ({ id: column.id!, label: String(column.header) }));

export const defaultColumnOrder = columns.map((column) => column.id!);
