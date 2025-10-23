import { ColumnDef } from "@tanstack/react-table";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import useSWR from "swr";

import { swrFetcher } from "@/lib/utils";

import ClientTimestampFormatter from "../client-timestamp-formatter";
import { DataTable } from "../ui/datatable";

export default function EvaluationsGroupsBar() {
  const { projectId } = useParams();

  const router = useRouter();
  const searchParams = useSearchParams();

  const { data: groups } = useSWR<{ groupId: string; lastEvaluationCreatedAt: string }[]>(
    `/api/projects/${projectId}/evaluation-groups`,
    swrFetcher
  );

  const groupId = searchParams.get("groupId");

  useEffect(() => {
    if (groups && groups.length > 0 && !groupId) {
      router.replace(`/project/${projectId}/evaluations?groupId=${groups[0].groupId}`);
    }
  }, [groups, groupId, router, projectId]);

  const columns: ColumnDef<{ groupId: string; lastEvaluationCreatedAt: string }>[] = [
    {
      header: "Group",
      accessorFn: (row) => row.groupId,
      size: 135,
    },
    {
      header: "Last Evaluation",
      accessorFn: (row) => row.lastEvaluationCreatedAt,
      cell: ({ row }) => <ClientTimestampFormatter timestamp={row.original.lastEvaluationCreatedAt} />,
      size: 135,
    },
  ];

  return (
    <div className="max-w-80 flex flex-1 flex-col gap-2">
      <div className="flex overflow-hidden">
        <DataTable
          className="w-full"
          columns={columns}
          data={groups}
          getRowId={(row) => row.groupId}
          focusedRowId={groupId}
          onRowClick={(row) => {
            router.push(`/project/${projectId}/evaluations?groupId=${row.original.groupId}`);
          }}
        />
      </div>
    </div>
  );
}
