"use client";

import { type ColumnDef, type RowSelectionState } from "@tanstack/react-table";
import { Loader2, SquareArrowOutUpRight, Trash2 } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
import { Button } from "@/components/ui/button";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { useInfiniteScroll } from "@/components/ui/infinite-datatable/hooks";
import { DataTableStateProvider } from "@/components/ui/infinite-datatable/model/datatable-store";
import ColumnsMenu from "@/components/ui/infinite-datatable/ui/columns-menu.tsx";
import DataTableFilter, { DataTableFilterList } from "@/components/ui/infinite-datatable/ui/datatable-filter";
import { type ColumnFilter } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";
import { DataTableSearch } from "@/components/ui/infinite-datatable/ui/datatable-search";
import Mono from "@/components/ui/mono";
import { TableCell, TableRow } from "@/components/ui/table";
import { useToast } from "@/lib/hooks/use-toast";
import { type LabelingQueue } from "@/lib/queue/types";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import Header from "../ui/header";
import CreateQueueDialog from "./create-queue-dialog";

const columns: ColumnDef<LabelingQueue>[] = [
  {
    cell: ({ row }) => <Mono>{row.original.id}</Mono>,
    size: 300,
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
    id: "count",
    accessorKey: "count",
    header: "Items count",
    size: 300,
  },
  {
    id: "createdAt",
    header: "Created",
    accessorKey: "createdAt",
    cell: (row) => <ClientTimestampFormatter absolute timestamp={String(row.getValue())} />,
  },
];

export const defaultQueuesColumnOrder = ["__row_selection", "id", "name", "count", "createdAt"];

const queuesTableFilters: ColumnFilter[] = [
  {
    name: "ID",
    key: "id",
    dataType: "string",
  },
  {
    name: "Name",
    key: "name",
    dataType: "string",
  },
  {
    name: "Items count",
    key: "count",
    dataType: "number",
  },
];

const FETCH_SIZE = 50;

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
            href="https://docs.laminar.sh/queues/quickstart"
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

const QueuesContent = () => {
  const { projectId } = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const filter = searchParams.getAll("filter");
  const search = searchParams.get("search");

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
          headers: {
            "Content-Type": "application/json",
          },
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
  } = useInfiniteScroll<LabelingQueue & { count: number }>({
    fetchFn: fetchQueues,
    enabled: true,
    deps: [projectId, filter, search],
  });

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteQueues = async (queueIds: string[]) => {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/queues?queueIds=${queueIds.join(",")}`, {
        method: "DELETE",
      });

      if (res.ok) {
        updateData((currentData) => currentData.filter((queue) => !queueIds.includes(queue.id)));
        setRowSelection({});
        toast({
          title: "Queues deleted",
          description: `Successfully deleted ${queueIds.length} queue(s).`,
        });
      } else {
        throw new Error("Failed to delete queues");
      }
    } catch (error) {
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
    <>
      <Header path="labeling queues" />
      <div className="flex flex-1 flex-col gap-4 px-4 pb-4 overflow-hidden">
        <CreateQueueDialog onSuccess={(queue) => router.push(`/project/${projectId}/labeling-queues/${queue.id}`)}>
          <Button icon="plus" className="w-fit">
            Queue
          </Button>
        </CreateQueueDialog>
        <InfiniteDataTable
          enableRowSelection={true}
          getRowHref={(row) => `/project/${projectId}/labeling-queues/${row.original.id}`}
          getRowId={(row: LabelingQueue) => row.id}
          columns={columns}
          data={queues ?? []}
          hasMore={hasMore}
          isFetching={isFetching}
          isLoading={isLoading}
          fetchNextPage={fetchNextPage}
          state={{
            rowSelection,
          }}
          onRowSelectionChange={setRowSelection}
          lockedColumns={["__row_selection"]}
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
          <div className="flex flex-1 w-full space-x-2 pt-1">
            <DataTableFilter columns={queuesTableFilters} />
            <ColumnsMenu
              columnLabels={columns.map((column) => ({
                id: column.id!,
                label: typeof column.header === "string" ? column.header : column.id!,
              }))}
              lockedColumns={["__row_selection"]}
            />
            <DataTableSearch className="mr-0.5" placeholder="Search by queue name..." />
          </div>
          <DataTableFilterList />
        </InfiniteDataTable>
      </div>
    </>
  );
};

export default function Queues() {
  return (
    <DataTableStateProvider storageKey="queues-table" defaultColumnOrder={defaultQueuesColumnOrder}>
      <QueuesContent />
    </DataTableStateProvider>
  );
}
