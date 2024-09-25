import { useProjectContext } from "@/contexts/project-context";
import { SpanLabel } from "@/lib/traces/types";
import { swrFetcher } from "@/lib/utils";
import useSWR from "swr";
import { DataTable } from "../ui/datatable";
import { useEffect } from "react";
import { Row } from "@tanstack/react-table";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { eventEmitter } from "@/lib/event-emitter";

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

  const columns = [
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
    }
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