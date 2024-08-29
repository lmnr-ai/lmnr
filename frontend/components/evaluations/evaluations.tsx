'use client'

import { useProjectContext } from "@/contexts/project-context";
import { EvaluationWithPipelineInfo } from "@/lib/evaluation/types";
import { ColumnDef } from "@tanstack/react-table";
import { MoreVertical } from "lucide-react";
import CreateEvaluationDialog from "./create-evaluation-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "../ui/button";
import ClientTimestampFormatter from "../client-timestamp-formatter";
import { useRouter } from "next/navigation";
import { DataTable } from "../ui/datatable";
import Mono from "../ui/mono";
import Header from "../ui/header";

export interface EvaluationProps {
  evaluations: EvaluationWithPipelineInfo[];
}

export default function Evaluations({ evaluations }: EvaluationProps) {
  const { projectId } = useProjectContext();
  const router = useRouter();

  const columns: ColumnDef<EvaluationWithPipelineInfo>[] = [
    {
      accessorKey: "status",
      header: "Status",
      size: 80
    },
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
      header: "Created at",
      accessorKey: "createdAt",
      cell: (row) => <ClientTimestampFormatter timestamp={String(row.getValue())} />,
    },
    {
      accessorFn: (row) => {
        if (!row.executorPipelineName || !row.executorPipelineVersionName) return '-'
        return row.executorPipelineName + ':' + row.executorPipelineVersionName
      },
      header: 'Executor',
      size: 200
    },

    {
      accessorFn: (row) => row.evaluatorPipelineName + ':' + row.evaluatorPipelineVersionName,
      header: 'Evaluator',
      size: 200
    },
  ];

  return (
    <div className="flex flex-col h-full">
      <Header path="evaluations" />
      <div className="flex justify-between items-center flex-none h-14 p-4">
        <h3 className="scroll-m-20 text-lg font-semibold tracking-tight">
          Evaluations
        </h3>
        <CreateEvaluationDialog />
      </div>
      <div className="flex-grow">
        <DataTable columns={columns} data={evaluations} onRowClick={(row) => {
          router.push(`/project/${projectId}/evaluations/${row.id}`)
        }} />
      </div>
    </div>
  );
}