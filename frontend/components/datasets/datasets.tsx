'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Loader2, Trash2 } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { useProjectContext } from '@/contexts/project-context';
import { DatasetInfo } from '@/lib/dataset/types';
import { useToast } from '@/lib/hooks/use-toast';
import { PaginatedResponse } from '@/lib/types';

import ClientTimestampFormatter from '../client-timestamp-formatter';
import { DataTable } from '../ui/datatable';
import Header from '../ui/header';
import Mono from '../ui/mono';
import { TableCell, TableRow } from '../ui/table';
import CreateDatasetDialog from './create-dataset-dialog';

export default function Datasets() {
  const { projectId } = useProjectContext();
  const router = useRouter();
  const searchParams = new URLSearchParams(useSearchParams().toString());
  const pathName = usePathname();
  const [datasets, setDatasets] = useState<DatasetInfo[] | undefined>(undefined);
  const [totalCount, setTotalCount] = useState<number>(0);

  const pageNumber = searchParams.get('pageNumber')
    ? parseInt(searchParams.get('pageNumber')!)
    : 0;
  const pageSize = searchParams.get('pageSize')
    ? parseInt(searchParams.get('pageSize')!)
    : 50;


  const getDatasets = async () => {
    setDatasets(undefined);
    const url = `/api/projects/${projectId}/datasets/?pageNumber=${pageNumber}&pageSize=${pageSize}`;

    const res = await fetch(url, {
      method: 'GET',
    }
    );

    const data = (await res.json()) as PaginatedResponse<DatasetInfo>;
    setDatasets(data.items);
    setTotalCount(data.totalCount);
  };

  useEffect(() => {
    getDatasets();
  }, [pageNumber, pageSize]);

  const pageCount = Math.ceil(totalCount / pageSize);

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
        getDatasets();
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

  const columns: ColumnDef<DatasetInfo>[] = [
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
      accessorKey: 'datapointsCount',
      header: 'Datapoints Count',
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
          getRowId={(row: DatasetInfo) => row.id}
          columns={columns}
          data={datasets}
          paginated
          manualPagination
          pageCount={pageCount}
          defaultPageSize={pageSize}
          defaultPageNumber={pageNumber}
          onPageChange={(pageNumber, pageSize) => {
            searchParams.set('pageNumber', pageNumber.toString());
            searchParams.set('pageSize', pageSize.toString());
            router.push(`${pathName}?${searchParams.toString()}`);
          }}
          totalItemsCount={totalCount}
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
