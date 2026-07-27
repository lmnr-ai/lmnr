"use client";

import { type ColumnDef, type RowSelectionState } from "@tanstack/react-table";
import { Check, Circle, Loader2, Pencil, SquareArrowOutUpRight, Trash2 } from "lucide-react";
import { useParams } from "next/navigation";
import { memo, type ReactNode, useCallback, useState } from "react";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
import { FETCH_SIZE } from "@/components/queues/constants";
import { Button } from "@/components/ui/button";
import CopyTooltip from "@/components/ui/copy-tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { useInfiniteScroll } from "@/components/ui/infinite-datatable/hooks";
import Mono from "@/components/ui/mono";
import { TableCell, TableRow } from "@/components/ui/table";
import { useToast } from "@/lib/hooks/use-toast";
import { track } from "@/lib/posthog";
import { EMPTY_PROGRESS, type LabelingQueueWithProgress } from "@/lib/queue/types";

const columns: ColumnDef<LabelingQueueWithProgress>[] = [
  {
    cell: ({ row }) => (
      <CopyTooltip value={row.original.id} className="block truncate">
        <Mono className="text-xs">{row.original.id}</Mono>
      </CopyTooltip>
    ),
    size: 120,
    header: "ID",
    id: "id",
  },
  {
    id: "name",
    accessorKey: "name",
    header: "Name",
    size: 300,
  },
  {
    id: "progress",
    header: "Progress",
    size: 220,
    cell: ({ row }) => {
      const progress = row.original.progress ?? EMPTY_PROGRESS;
      return (
        <div className="flex items-center gap-3 text-xs tabular-nums">
          <span className="inline-flex items-center gap-1 text-secondary-foreground">
            <Circle className="size-3 text-muted-foreground" />
            {progress.new}
          </span>
          <span className="inline-flex items-center gap-1 text-secondary-foreground">
            <Pencil className="size-3 text-amber-500" />
            {progress.modified}
          </span>
          <span className="inline-flex items-center gap-1 text-secondary-foreground">
            <Check className="size-3 text-success-bright" />
            {progress.approved}
          </span>
        </div>
      );
    },
  },
  {
    id: "createdAt",
    header: "Created",
    accessorKey: "createdAt",
    cell: (row) => <ClientTimestampFormatter absolute timestamp={String(row.getValue())} />,
  },
];

export const queuesColumnLabels = columns.map((col) => ({
  id: col.id!,
  label: typeof col.header === "string" ? col.header : col.id!,
}));

const EmptyRow = (
  <TableRow className="flex">
    <TableCell className="text-center p-4 rounded-b w-full h-auto">
      <div className="flex flex-1 justify-center">
        <div className="flex flex-col gap-2 items-center max-w-md">
          <h3 className="text-base font-medium text-secondary-foreground">No labeling queues yet</h3>
          <p className="text-sm text-muted-foreground text-center">
            Labeling queues let you review and annotate items with a FIFO workflow, then save results to a dataset.
            Click + Queue above to create one.
          </p>
          <a
            href="https://laminar.sh/docs/queues/quickstart"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            Learn more
            <SquareArrowOutUpRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </TableCell>
  </TableRow>
);

export interface QueuesGridProps {
  chrome: ReactNode;
  filter: string[];
  search: string | null;
  isViewLoading: boolean;
}

export const QueuesGrid = memo(function QueuesGrid({ chrome, filter, search, isViewLoading }: QueuesGridProps) {
  const { projectId } = useParams();
  const { toast } = useToast();
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchQueues = useCallback(
    async (pageNumber: number) => {
      try {
        const urlParams = new URLSearchParams();
        urlParams.set("pageNumber", pageNumber.toString());
        urlParams.set("pageSize", FETCH_SIZE.toString());

        filter.forEach((f) => urlParams.append("filter", f));

        if (typeof search === "string" && search.length > 0) {
          urlParams.set("search", search);
        }

        const url = `/api/projects/${projectId}/queues?${urlParams.toString()}`;
        const res = await fetch(url, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        });

        if (!res.ok) {
          const text = await res.json();
          throw new Error(text.error || "Failed to fetch queues");
        }

        const data = await res.json();
        return { items: data.items, count: data.totalCount };
      } catch (error) {
        toast({
          title: error instanceof Error ? error.message : "Failed to load queues. Please try again.",
          variant: "destructive",
        });
        throw error;
      }
    },
    [projectId, toast, filter, search]
  );

  const {
    data: queues,
    hasMore,
    isFetching,
    isLoading,
    fetchNextPage,
    updateData,
  } = useInfiniteScroll<LabelingQueueWithProgress>({
    fetchFn: fetchQueues,
    enabled: !isViewLoading,
    deps: [projectId, filter, search],
  });

  const handleDeleteQueues = async (queueIds: string[]) => {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/queues?queueIds=${queueIds.join(",")}`, {
        method: "DELETE",
      });

      if (res.ok) {
        updateData((currentData) => currentData.filter((queue) => !queueIds.includes(queue.id)));
        setRowSelection({});
        track("labeling_queues", "deleted", { count: queueIds.length });
        toast({
          title: "Queues deleted",
          description: `Successfully deleted ${queueIds.length} queue(s).`,
        });
      } else {
        throw new Error("Failed to delete queues");
      }
    } catch {
      toast({
        title: "Error",
        description: "Failed to delete queues. Please try again.",
        variant: "destructive",
      });
    }
    setIsDeleting(false);
    setIsDeleteDialogOpen(false);
  };

  return (
    <InfiniteDataTable<LabelingQueueWithProgress>
      className="h-full"
      enableRowSelection={true}
      getRowHref={(row) => `/project/${projectId}/labeling-queues/${row.original.id}`}
      getRowId={(row) => row.id}
      columns={columns}
      data={queues ?? []}
      hasMore={hasMore}
      isFetching={isFetching}
      isLoading={isLoading || isViewLoading}
      fetchNextPage={fetchNextPage}
      state={{ rowSelection }}
      onRowSelectionChange={setRowSelection}
      emptyRow={filter.length === 0 && !search ? EmptyRow : undefined}
      selectionPanel={(selectedRowIds) => (
        <div className="flex flex-col space-y-2">
          <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost">
                <Trash2 size={12} />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete Labeling Queues</DialogTitle>
                <DialogDescription>
                  Are you sure you want to delete {selectedRowIds.length} labeling queue(s)? This action cannot be
                  undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)} disabled={isDeleting}>
                  Cancel
                </Button>
                <Button onClick={() => handleDeleteQueues(selectedRowIds)} disabled={isDeleting}>
                  {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Delete
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}
    >
      {chrome}
    </InfiniteDataTable>
  );
});
