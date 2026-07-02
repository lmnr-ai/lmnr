import { type ColumnDef } from "@tanstack/react-table";
import { useParams } from "next/navigation";
import { parseAsString, useQueryState } from "nuqs";
import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";

import { InfiniteDataTableProvider } from "@/components/ui/infinite-datatable/model/table-store";
import { swrFetcher } from "@/lib/utils";

import ClientTimestampFormatter from "../client-timestamp-formatter";
import { InfiniteDataTable } from "../ui/infinite-datatable";

type EvaluationGroup = { groupId: string; lastEvaluationCreatedAt: string };

export const defaultEvaluationsGroupsBarColumnOrder = ["groupId", "lastEvaluationCreatedAt"];

export default function EvaluationsGroupsBar() {
  return (
    <InfiniteDataTableProvider defaults={{ columnOrder: defaultEvaluationsGroupsBarColumnOrder }}>
      <EvaluationsGroupsBarContent />
    </InfiniteDataTableProvider>
  );
}

const LAST_EVALUATION_COLUMN_SIZE = 160;
const MIN_GROUP_COLUMN_SIZE = 160;

function EvaluationsGroupsBarContent() {
  const { projectId } = useParams();

  const [groupId, setGroupId] = useQueryState("groupId", parseAsString);

  const { data: groups, isLoading } = useSWR<EvaluationGroup[]>(
    `/api/projects/${projectId}/evaluation-groups`,
    swrFetcher
  );

  useEffect(() => {
    if (groups && groups.length > 0 && !groupId) {
      void setGroupId(groups[0].groupId);
    }
  }, [groups, groupId, setGroupId]);

  // Grow the group-name column with the (resizable) panel so long names stay visible.
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      setContainerWidth(entries[0]?.contentRect.width ?? 0);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const columns: ColumnDef<EvaluationGroup>[] = useMemo(
    () => [
      {
        id: "groupId",
        header: "Group",
        accessorFn: (row) => row.groupId,
        size: Math.max(containerWidth - LAST_EVALUATION_COLUMN_SIZE, MIN_GROUP_COLUMN_SIZE),
      },
      {
        id: "lastEvaluationCreatedAt",
        header: "Last Evaluation",
        accessorFn: (row) => row.lastEvaluationCreatedAt,
        cell: ({ row }) => <ClientTimestampFormatter timestamp={row.original.lastEvaluationCreatedAt} />,
        size: LAST_EVALUATION_COLUMN_SIZE,
      },
    ],
    [containerWidth]
  );

  return (
    <div ref={containerRef} className="flex h-full w-full flex-col gap-2">
      <div className="flex overflow-hidden">
        <InfiniteDataTable<EvaluationGroup>
          className="w-full"
          columns={columns}
          data={groups || []}
          getRowId={(row) => row.groupId}
          focusedRowId={groupId}
          getRowHref={(row) => `/project/${projectId}/evaluations?groupId=${row.original.groupId}`}
          hasMore={false}
          isFetching={false}
          isLoading={isLoading}
          fetchNextPage={() => {}}
        />
      </div>
    </div>
  );
}
