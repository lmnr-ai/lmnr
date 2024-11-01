'use client';

import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { useToast } from '@/lib/hooks/use-toast';
import { swrFetcher } from '@/lib/utils';

import { useProjectContext } from '@/contexts/project-context';
import { useRouter } from 'next/navigation';
import { Loader2, MoreVertical, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ColumnDef } from '@tanstack/react-table';
import { Dataset } from '@/lib/dataset/types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import useSWR from 'swr';
import CreateDatasetDialog from './create-dataset-dialog';
import UpdateDatasetDialog from './update-dataset-dialog';
import ClientTimestampFormatter from '../client-timestamp-formatter';
import { DataTable } from '../ui/datatable';
import Header from '../ui/header';
import { TableCell, TableRow } from '../ui/table';
import { PaginatedResponse } from '@/lib/types';
import Mono from '../ui/mono';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';

export default function Datasets() {
  const { projectId } = useProjectContext();
  const fetcher = (url: string) => fetch(url).then((res) => res.json());
  const router = useRouter();
  const { data, isLoading, mutate } = useSWR<PaginatedResponse<Dataset>>(
    `/api/projects/${projectId}/datasets/`,
    fetcher
  );

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();

  const handleDeleteDatasets = async (datasetIds: string[]) => {
    setIsDeleting(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/datasets?datasetIds=${datasetIds.join(',')}`,
        {
          method: 'DELETE',
        }
      );

      if (res.ok) {
        mutate();
        toast({
          title: 'Datasets deleted',
          description: `Successfully deleted ${datasetIds.length} dataset(s).`,
        });
      } else {
        throw new Error('Failed to delete datasets');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete datasets. Please try again.',
        variant: 'destructive',
      });
    }
    setIsDeleting(false);
    setIsDeleteDialogOpen(false);
  };

  const columns: ColumnDef<Dataset>[] = [
    {
      cell: ({ row }) => <Mono>{row.original.id}</Mono>,
      size: 300,
      header: 'ID'
    },
    {
      accessorKey: 'name',
      header: 'name',
      size: 300
    },
    {
      header: 'Created at',
      accessorKey: 'createdAt',
      cell: (row) => (
        <ClientTimestampFormatter timestamp={String(row.getValue())} />
      )
    },
  ];

  return (
    <div className="h-full flex flex-col">
      <Header path="datasets" />
      <div className="flex justify-between items-center p-4 flex-none">
        <h1 className="scroll-m-20 text-2xl font-medium">
          Datasets
        </h1>
        <CreateDatasetDialog />
      </div>
      <div className="flex-grow">
        <DataTable
          enableRowSelection={true}
          onRowClick={(row) => {
            router.push(`/project/${projectId}/datasets/${row.original.id}`);
          }}
          getRowId={(row: Dataset) => row.id}
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
                    <DialogTitle>Delete Datasets</DialogTitle>
                    <DialogDescription>
                        Are you sure you want to delete {selectedRowIds.length} dataset(s)? This action cannot be undone.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)} disabled={isDeleting}>
                        Cancel
                    </Button>
                    <Button onClick={() => handleDeleteDatasets(selectedRowIds)} disabled={isDeleting}>
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
                Create a new dataset to get started
              </TableCell>
            </TableRow>
          }
        />
      </div>
    </div>
  );
}
