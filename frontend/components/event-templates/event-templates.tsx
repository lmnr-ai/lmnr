'use client'

import { useProjectContext } from "@/contexts/project-context";
import { ColumnDef } from "@tanstack/react-table";
import ClientTimestampFormatter from "../client-timestamp-formatter";
import { useRouter } from "next/navigation";
import { DataTable } from "../ui/datatable";
import Mono from "../ui/mono";
import Header from "../ui/header";
import { EventTemplate } from "@/lib/events/types";
import CreateEventTemplateDialog from "./create-event-template-dialog";

export interface EventProps {
  events: EventTemplate[];
}

export default function EventTemplates({ events }: EventProps) {
  const { projectId } = useProjectContext();
  const router = useRouter();

  const columns: ColumnDef<EventTemplate>[] = [
    {
      accessorKey: "id",
      cell: (row) => <Mono>{String(row.getValue())}</Mono>,
      header: "ID",
      size: 300
    },
    {
      accessorKey: "name",
      header: "Name",
    },
    {
      accessorFn: (row) => row.description || "-",
      header: "Description",
    },
    {
      accessorFn: (row) => row.instruction || "-",
      header: "Instruction",
    },
    {
      header: "Created at",
      accessorKey: "createdAt",
      cell: (row) => <ClientTimestampFormatter timestamp={String(row.getValue())} />,
    },
    {
      header: "Type",
      accessorKey: "eventType",
    },
  ];

  return (
    <div className="flex flex-col h-full">
      <Header path="event templates" />
      <div className="flex justify-between items-center flex-none h-14 p-4">
        <h3 className="scroll-m-20 text-lg font-semibold tracking-tight">
          Events
        </h3>
        <CreateEventTemplateDialog />
      </div>
      <div className="flex-grow">
        <DataTable columns={columns} data={events} onRowClick={(row) => {
          router.push(`/project/${projectId}/event-templates/${row.id}`)
        }} />
      </div>
    </div>
  );
}
