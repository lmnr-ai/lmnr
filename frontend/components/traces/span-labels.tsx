import { useProjectContext } from "@/contexts/project-context";
import { SpanLabel } from "@/lib/traces/types";
import { swrFetcher } from "@/lib/utils";
import useSWR from "swr";
import { DataTable } from "../ui/datatable";
import { useEffect } from "react";
import { ColumnDef } from "@tanstack/react-table";

import { eventEmitter } from "@/lib/event-emitter";
import ClientTimestampFormatter from "../client-timestamp-formatter";

interface SpanLabelsProps {
  spanId: string;
}

export default function SpanLabels({
  spanId,
}: SpanLabelsProps) {
  const { projectId } = useProjectContext();

  const { data, mutate } = useSWR<SpanLabel[]>(
    `/api/projects/${projectId}/spans/${spanId}/labels`,
    swrFetcher
  );


  useEffect(() => {

    const handleTagAdded = () => {
      mutate();
    };
    eventEmitter.on('tagAdded', handleTagAdded);

    return () => {
      eventEmitter.off('tagAdded', handleTagAdded);
    };
  }, [mutate]);

  const columns: ColumnDef<SpanLabel>[] = [
    {
      accessorKey: 'className',
      header: 'Name',
    },
    {
      accessorKey: 'labelType',
      header: 'Type',
    },
    {
      accessorFn: (row: SpanLabel) => {
        return row.valueMap?.[row.value] ?? '';
      },
      header: 'Value',
    },
    {
      accessorFn: (row: SpanLabel) => {
        return row.userEmail ?? (row.labelSource === 'Auto' ? 'Auto-labeled' : '-');
      },
      header: 'User',
    },
    {
      accessorKey: 'updatedAt',
      header: 'Updated At',
      cell: row =>
        <ClientTimestampFormatter timestamp={String(row.getValue())} />
    },
  ];

  return (
    <div className="flex flex-col">
      <div className="border-none flex inset-0 absolute flex-grow">
        <div className="flex flex-none h-full w-full">
          <DataTable columns={columns} data={data} className="h-full w-full border-none" />
        </div>
      </div>
    </div>
  )
}