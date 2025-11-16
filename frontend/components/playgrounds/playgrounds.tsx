"use client";

import { ColumnDef, RowSelectionState } from "@tanstack/react-table";
import { Loader2, Trash2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";

import { Button } from "@/components/ui/button";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { DataTableStateProvider } from "@/components/ui/infinite-datatable/model/datatable-store";
import ColumnsMenu from "@/components/ui/infinite-datatable/ui/columns-menu.tsx";
import { useToast } from "@/lib/hooks/use-toast";
import { PlaygroundInfo } from "@/lib/playground/types";
import { swrFetcher } from "@/lib/utils";

import ClientTimestampFormatter from "../client-timestamp-formatter";
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
import Mono from "../ui/mono";
import CreatePlaygroundDialog from "./create-playground-dialog";

const columns: ColumnDef<PlaygroundInfo>[] = [
  {
    cell: ({ row }) => <Mono>{row.original.id}</Mono>,
    size: 300,
    header: "ID",
    id: "id",
  },
  {
    accessorKey: "name",
    header: "name",
    size: 300,
  },
  {
    header: "Created at",
    accessorKey: "createdAt",
    cell: (row) => <ClientTimestampFormatter timestamp={String(row.getValue())} />,
  },
];

export const defaultPlaygroundsColumnOrder = ["__row_selection", "id", "name", "createdAt"];

const PlaygroundsContent = () => {
  const { projectId } = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const { data, mutate } = useSWR<PlaygroundInfo[]>(`/api/projects/${projectId}/playgrounds`, swrFetcher);

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeletePlaygrounds = async (playgroundIds: string[]) => {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/playgrounds?playgroundIds=${playgroundIds.join(",")}`, {
        method: "DELETE",
      });

      if (res.ok) {
        mutate();
        setRowSelection({});
        toast({
          title: "Playgrounds deleted",
          description: `Successfully deleted ${playgroundIds.length} playground(s).`,
        });
      } else {
        throw new Error("Failed to delete playgrounds");
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete playgrounds. Please try again.",
        variant: "destructive",
      });
    }
    setIsDeleting(false);
    setIsDeleteDialogOpen(false);
  };

  return (
    <>
      <Header path="playgrounds" />
      <div className="flex flex-col gap-4 px-4 pb-4 overflow-hidden">
        <CreatePlaygroundDialog />
        <InfiniteDataTable
          enableRowSelection={true}
          onRowClick={(row) => {
            router.push(`/project/${projectId}/playgrounds/${row.original.id}`);
          }}
          getRowId={(row) => row.id}
          columns={columns}
          data={data ?? []}
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
                    <DialogTitle>Delete Playgrounds</DialogTitle>
                    <DialogDescription>
                      Are you sure you want to delete {selectedRowIds.length} playground(s)? This action cannot be
                      undone.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)} disabled={isDeleting}>
                      Cancel
                    </Button>
                    <Button onClick={() => handleDeletePlaygrounds(selectedRowIds)} disabled={isDeleting}>
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

export default function Playgrounds() {
  return (
    <DataTableStateProvider storageKey="playgrounds-table" defaultColumnOrder={defaultPlaygroundsColumnOrder}>
      <PlaygroundsContent />
    </DataTableStateProvider>
  );
}
