"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Loader2, PlusIcon, Trash2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
import { Button } from "@/components/ui/button";
import Mono from "@/components/ui/mono";
import { useToast } from "@/lib/hooks/use-toast";
import { LabelingQueue } from "@/lib/queue/types";
import { PaginatedResponse } from "@/lib/types";
import { swrFetcher } from "@/lib/utils";

import { DataTable } from "../ui/datatable";
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
import { TableCell, TableRow } from "../ui/table";
import CreateQueueDialog from "./create-queue-dialog";

const columns: ColumnDef<LabelingQueue>[] = [
  {
    cell: ({ row }) => <Mono>{row.original.id}</Mono>,
    size: 300,
    header: "ID",
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

export default function Queues() {
  const { projectId } = useParams();

  const router = useRouter();
  const { data, mutate } = useSWR<PaginatedResponse<LabelingQueue & { count: number }>>(
    `/api/projects/${projectId}/queues`,
    swrFetcher
  );

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();

  const handleDeleteQueues = async (queueIds: string[]) => {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/queues?queueIds=${queueIds.join(",")}`, {
        method: "DELETE",
      });

      if (res.ok) {
        mutate();
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
          <Button className="w-fit">
            <PlusIcon className="size-4 mr-2" /> Queue
          </Button>
        </CreateQueueDialog>
        <DataTable
          enableRowSelection={true}
          onRowClick={(row) => {
            router.push(`/project/${projectId}/labeling-queues/${row.original.id}`);
          }}
          getRowId={(row: LabelingQueue) => row.id}
          columns={columns}
          data={data?.items}
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
          emptyRow={
            <TableRow>
              <TableCell colSpan={columns.length} className="text-center text">
                Create a new queue to get started
              </TableCell>
            </TableRow>
          }
        />
      </div>
    </>
  );
}
