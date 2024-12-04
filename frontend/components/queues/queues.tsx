'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Loader2, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import useSWR from 'swr';

import { Button } from '@/components/ui/button';
import { useProjectContext } from '@/contexts/project-context';
import { useToast } from '@/lib/hooks/use-toast';
import { LabelingQueue } from '@/lib/queue/types';
import { PaginatedResponse } from '@/lib/types';
import { swrFetcher } from '@/lib/utils';

import ClientTimestampFormatter from '../client-timestamp-formatter';
import { DataTable } from '../ui/datatable';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import Header from '../ui/header';
import Mono from '../ui/mono';
import { TableCell, TableRow } from '../ui/table';
import CreateQueueDialog from './create-queue-dialog';

export default function Queues() {
  const { projectId } = useProjectContext();

  const router = useRouter();
  const { data, mutate } = useSWR<PaginatedResponse<LabelingQueue>>(
    `/api/projects/${projectId}/queues/`,
    swrFetcher
  );

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();

  const handleDeleteQueues = async (queueIds: string[]) => {
    setIsDeleting(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/queues?queueIds=${queueIds.join(',')}`,
        {
          method: 'DELETE',
        }
      );

      if (res.ok) {
        mutate();
        toast({
          title: 'Queues deleted',
          description: `Successfully deleted ${queueIds.length} queue(s).`,
        });
      } else {
        throw new Error('Failed to delete queues');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete queues. Please try again.',
        variant: 'destructive',
      });
    }
    setIsDeleting(false);
    setIsDeleteDialogOpen(false);
  };

  const columns: ColumnDef<LabelingQueue>[] = [
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
      <Header path="labeling queues" />
      <div className="flex justify-between items-center p-4 flex-none">
        <h1 className="scroll-m-20 text-2xl font-medium">
          Labeling Queues
        </h1>
        <CreateQueueDialog />
      </div>
      <div className="flex-grow">
        <DataTable
          paginated
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
                      Are you sure you want to delete {selectedRowIds.length} labeling queue(s)? This action cannot be undone.
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
    </div>
  );
}
