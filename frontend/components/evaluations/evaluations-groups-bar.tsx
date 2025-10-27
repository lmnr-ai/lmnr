import { ColumnDef, Row } from "@tanstack/react-table";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect } from "react";
import useSWR from "swr";

import { swrFetcher } from "@/lib/utils";

import ClientTimestampFormatter from "../client-timestamp-formatter";
import { InfiniteDataTable } from "../ui/infinite-datatable";

type EvaluationGroup = { groupId: string; lastEvaluationCreatedAt: string };

export default function EvaluationsGroupsBar() {
  const { projectId } = useParams();

  const router = useRouter();
  const searchParams = useSearchParams();

  const { data: groups, isLoading } = useSWR<EvaluationGroup[]>(
    `/api/projects/${projectId}/evaluation-groups`,
    swrFetcher
  );

  const groupId = searchParams.get("groupId");

  useEffect(() => {
    if (groups && groups.length > 0 && !groupId) {
      router.replace(`/project/${projectId}/evaluations?groupId=${groups[0].groupId}`);
    }
  }, [groups, groupId, router, projectId]);

  const columns: ColumnDef<EvaluationGroup>[] = [
    {
      header: "Group",
      accessorFn: (row) => row.groupId,
      size: 160,
    },
    {
      header: "Last Evaluation",
      accessorFn: (row) => row.lastEvaluationCreatedAt,
      cell: ({ row }) => <ClientTimestampFormatter timestamp={row.original.lastEvaluationCreatedAt} />,
      size: 160,
    },
  ];

  const handleRowClick = useCallback(
    (row: Row<EvaluationGroup>) => {
      router.push(`/project/${projectId}/evaluations?groupId=${row.original.groupId}`);
    },
    [projectId, router]
  );

  return (
    <div className="max-w-80 flex flex-1 flex-col gap-2">
      <div className="flex overflow-hidden">
        <InfiniteDataTable<EvaluationGroup>
          className="w-full"
          columns={columns}
          data={groups || []}
          getRowId={(row) => row.groupId}
          focusedRowId={groupId}
          onRowClick={handleRowClick}
          hasMore={false}
          isFetching={false}
          isLoading={isLoading}
          fetchNextPage={() => {}}
        />
      </div>
    </div>
  );
}
