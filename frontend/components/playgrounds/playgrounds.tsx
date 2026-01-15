"use client";

import { type ColumnDef, type RowSelectionState } from "@tanstack/react-table";
import { Loader2, Trash2 } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { useInfiniteScroll } from "@/components/ui/infinite-datatable/hooks";
import { DataTableStateProvider } from "@/components/ui/infinite-datatable/model/datatable-store";
import ColumnsMenu from "@/components/ui/infinite-datatable/ui/columns-menu.tsx";
import DataTableFilter, { DataTableFilterList } from "@/components/ui/infinite-datatable/ui/datatable-filter";
import { type ColumnFilter } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";
import { DataTableSearch } from "@/components/ui/infinite-datatable/ui/datatable-search";
import { useToast } from "@/lib/hooks/use-toast";
import { type PlaygroundInfo } from "@/lib/playground/types";

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
    id: "name",
    accessorKey: "name",
    header: "Name",
    size: 300,
  },
  {
    id: "createdAt",
    header: "Created",
    accessorKey: "createdAt",
    cell: (row) => <ClientTimestampFormatter timestamp={String(row.getValue())} />,
  },
];

export const defaultPlaygroundsColumnOrder = ["__row_selection", "id", "name", "createdAt"];

const playgroundsTableFilters: ColumnFilter[] = [
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
];

const FETCH_SIZE = 50;

const PlaygroundsContent = () => {
  const { projectId } = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const filter = searchParams.getAll("filter");
  const search = searchParams.get("search");

  const fetchPlaygrounds = useCallback(
    async (pageNumber: number) => {
      try {
        const urlParams = new URLSearchParams();
        urlParams.set("pageNumber", pageNumber.toString());
        urlParams.set("pageSize", FETCH_SIZE.toString());

        filter.forEach((f) => urlParams.append("filter", f));

        if (typeof search === "string" && search.length > 0) {
          urlParams.set("search", search);
        }

        const url = `/api/projects/${projectId}/playgrounds?${urlParams.toString()}`;
        const res = await fetch(url, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (!res.ok) {
          const text = await res.json();
          throw new Error(text.error || "Failed to fetch playgrounds");
        }

        const data = await res.json();
        return { items: data.items, count: data.totalCount };
      } catch (error) {
        toast({
          title: error instanceof Error ? error.message : "Failed to load playgrounds. Please try again.",
          variant: "destructive",
        });
        throw error;
      }
    },
    [projectId, toast, filter, search]
  );

  const {
    data: playgrounds,
    hasMore,
    isFetching,
    isLoading,
    fetchNextPage,
    updateData,
  } = useInfiniteScroll<PlaygroundInfo>({
    fetchFn: fetchPlaygrounds,
    enabled: true,
    deps: [projectId, filter, search],
  });

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeletePlaygrounds = async (playgroundIds: string[]) => {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/playgrounds?playgroundIds=${playgroundIds.join(",")}`, {
        method: "DELETE",
      });

      if (res.ok) {
        updateData((currentData) => currentData.filter((playground) => !playgroundIds.includes(playground.id)));
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
          getRowHref={(row) => `/project/${projectId}/playgrounds/${row.original.id}`}
          getRowId={(row) => row.id}
          columns={columns}
          data={playgrounds ?? []}
          hasMore={hasMore}
          isFetching={isFetching}
          isLoading={isLoading}
          fetchNextPage={fetchNextPage}
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
          <div className="flex flex-1 w-full space-x-2 pt-1">
            <DataTableFilter columns={playgroundsTableFilters} />
            <ColumnsMenu
              columnLabels={columns.map((column) => ({
                id: column.id!,
                label: typeof column.header === "string" ? column.header : column.id!,
              }))}
              lockedColumns={["__row_selection"]}
            />
            <DataTableSearch className="mr-0.5" placeholder="Search by playground name..." />
          </div>
          <DataTableFilterList />
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
