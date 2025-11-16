"use client";

import { ColumnDef, RowSelectionState } from "@tanstack/react-table";
import { Loader2, Trash2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
import { Button } from "@/components/ui/button";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { DataTableStateProvider } from "@/components/ui/infinite-datatable/model/datatable-store";
import ColumnsMenu from "@/components/ui/infinite-datatable/ui/columns-menu.tsx";
import Mono from "@/components/ui/mono";
import { useToast } from "@/lib/hooks/use-toast";
import { LabelingQueue } from "@/lib/queue/types";
import { PaginatedResponse } from "@/lib/types";
import { swrFetcher } from "@/lib/utils";

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
    accessorKey: "name",
    header: "Name",
    size: 300,
  },
  {
    accessorKey: "count",
    header: "Count",
    size: 300,
  },
  {
    header: "Created at",
    accessorKey: "createdAt",
    cell: (row) => <ClientTimestampFormatter timestamp={String(row.getValue())} />,
  },
];

export const defaultQueuesColumnOrder = ["__row_selection", "id", "name", "count", "createdAt"];

const QueuesContent = () => {
  const { projectId } = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const { data, mutate } = useSWR<PaginatedResponse<LabelingQueue & { count: number }>>(
    `/api/projects/${projectId}/queues`,
    swrFetcher
  );

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteQueues = async (queueIds: string[]) => {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/queues?queueIds=${queueIds.join(",")}`, {
        method: "DELETE",
      });

      if (res.ok) {
        mutate();
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
      <div className="flex flex-col gap-4 px-4 pb-4">
        <CreateQueueDialog onSuccess={(queue) => router.push(`/project/${projectId}/labeling-queues/${queue.id}`)}>
          <Button icon="plus" className="w-fit">
            Queue
          </Button>
        </CreateQueueDialog>
        <InfiniteDataTable
          enableRowSelection={true}
          onRowClick={(row) => {
            router.push(`/project/${projectId}/labeling-queues/${row.original.id}`);
          }}
          getRowId={(row: LabelingQueue) => row.id}
          columns={columns}
          data={data?.items ?? []}
          hasMore={false}
          isFetching={false}
          isLoading={!data}
          fetchNextPage={() => {}}
          state={{
            rowSelection,
          }}
          onRowSelectionChange={setRowSelection}
          lockedColumns={["__row_selection"]}
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
          <ColumnsMenu />
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
