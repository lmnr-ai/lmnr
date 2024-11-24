import { useRouter, useSearchParams } from "next/navigation";
import ClientTimestampFormatter from "../client-timestamp-formatter";
import { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "../ui/datatable";
import { swrFetcher } from "@/lib/utils";
import { useEffect } from "react";
import { useProjectContext } from "@/contexts/project-context";
import useSWR from "swr";

export default function EvaluationsGroupsBar() {
  const { projectId } = useProjectContext();

  const router = useRouter();
  const searchParams = useSearchParams();

  const { data: groups, isLoading } = useSWR<{ groupId: string, lastEvaluationCreatedAt: string }[]>(
    `/api/projects/${projectId}/evaluation-groups`,
    swrFetcher,
  );

  const groupId = searchParams.get('groupId');

  useEffect(() => {
    if (groups && groups.length > 0 && !groupId) {
      router.replace(`/project/${projectId}/evaluations?groupId=${groups[0].groupId}`);
    }
  }, [groups, groupId, router, projectId]);

  const columns: ColumnDef<{ groupId: string, lastEvaluationCreatedAt: string }>[] = [
    {
      header: 'Group',
      accessorFn: (row) => row.groupId,
    },
    {
      header: 'Last Evaluation',
      accessorFn: (row) => row.lastEvaluationCreatedAt,
      cell: ({ row }) => <ClientTimestampFormatter timestamp={row.original.lastEvaluationCreatedAt} />,
    },
  ];

  return <div className="flex-none w-80 border-r flex flex-col">
    <div className="font-medium p-2 px-4 text-lg">Groups</div>
    <DataTable
      columns={columns}
      data={groups}
      getRowId={(row) => row.groupId}
      focusedRowId={groupId}
      onRowClick={(row) => {
        router.push(`/project/${projectId}/evaluations?groupId=${row.original.groupId}`);
      }}
    />
  </div>;
}
