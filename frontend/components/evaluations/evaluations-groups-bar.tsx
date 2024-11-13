import { useProjectContext } from "@/contexts/project-context";
import { cn, swrFetcher } from "@/lib/utils";
import { ScrollArea } from "../ui/scroll-area";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { DataTable } from "../ui/datatable";
import { ColumnDef } from "@tanstack/react-table";
import ClientTimestampFormatter from "../client-timestamp-formatter";


export default function EvaluationsGroupsBar() {
  const { projectId } = useProjectContext();

  const router = useRouter();
  const searchParams = useSearchParams();

  const { data: groups, isLoading } = useSWR<{ groupId: string, lastEvaluationCreatedAt: string }[]>(
    `/api/projects/${projectId}/evaluation-groups`,
    swrFetcher,
  );

  if (groups && groups.length > 0 && !searchParams.get('groupId')) {
    router.push(`/project/${projectId}/evaluations?groupId=${groups[0].groupId}`);
  }

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

  const selectedGroupId = searchParams.get('groupId');

  return <div className="flex-none w-80 py-2 border-r flex flex-col">
    <div className="font-medium p-2 text-lg">Groups</div>
      <DataTable
        columns={columns}
        data={groups}
        onRowClick={(row) => {
          router.push(`/project/${projectId}/evaluations?groupId=${row.original.groupId}`);
        }}
      />
    </div>;
}
