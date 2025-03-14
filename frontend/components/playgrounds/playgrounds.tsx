"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";

import { Button } from "@/components/ui/button";
import { useProjectContext } from "@/contexts/project-context";
import { useToast } from "@/lib/hooks/use-toast";
import { PlaygroundInfo } from "@/lib/playground/types";
import { swrFetcher } from "@/lib/utils";

import ClientTimestampFormatter from "../client-timestamp-formatter";
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
import Mono from "../ui/mono";
import { TableCell, TableRow } from "../ui/table";
import CreatePlaygroundDialog from "./create-playground-dialog";

export default function Playgrounds() {
  const { projectId } = useProjectContext();

  const router = useRouter();
  const { data, mutate } = useSWR<PlaygroundInfo[]>(`/api/projects/${projectId}/playgrounds`, swrFetcher);

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();

  const handleDeletePlaygrounds = async (playgroundIds: string[]) => {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/playgrounds?playgroundIds=${playgroundIds.join(",")}`, {
        method: "DELETE",
      });

      if (res.ok) {
        mutate();
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

  const columns: ColumnDef<PlaygroundInfo>[] = [
    {
      cell: ({ row }) => <Mono>{row.original.id}</Mono>,
      size: 300,
      header: "ID",
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

  return (
    <div className="h-full flex flex-col">
      <Header path="playgrounds" />
      <div className="flex justify-between items-center p-4 flex-none">
        <h1 className="scroll-m-20 text-2xl font-medium">Playgrounds</h1>
        <CreatePlaygroundDialog />
      </div>
      <div className="flex-grow">
        <DataTable
          enableRowSelection={true}
          onRowClick={(row) => {
            router.push(`/project/${projectId}/playgrounds/${row.original.id}`);
          }}
          getRowId={(row) => row.id}
          columns={columns}
          data={data}
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
          emptyRow={
            <TableRow>
              <TableCell colSpan={columns.length} className="text-center text">
                Create a new playground to get started
              </TableCell>
            </TableRow>
          }
        />
      </div>
    </div>
  );
}
