'use client';

import { useProjectContext } from '@/contexts/project-context';
import { Evaluation } from '@/lib/evaluation/types';
import { ColumnDef } from '@tanstack/react-table';
import ClientTimestampFormatter from '../client-timestamp-formatter';
import { useRouter } from 'next/navigation';
import { DataTable } from '../ui/datatable';
import Mono from '../ui/mono';
import Header from '../ui/header';
import EvalsPagePlaceholder from './page-placeholder';
import { usePostHog } from 'posthog-js/react';
import { useUserContext } from '@/contexts/user-context';
import { Feature, isFeatureEnabled } from '@/lib/features/features';
import { Button } from '../ui/button';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../ui/dialog';
import { useToast } from '@/lib/hooks/use-toast';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import { PaginatedResponse } from '@/lib/types';

export default function Evaluations() {
  const { projectId } = useProjectContext();
  const { data, mutate, isLoading } = useSWR<PaginatedResponse<Evaluation>>(
    `/api/projects/${projectId}/evaluations`,
    swrFetcher
  );
  const evaluations = data?.items;

  const router = useRouter();
  const posthog = usePostHog();
  const { email } = useUserContext();

  if (isFeatureEnabled(Feature.POSTHOG)) {
    posthog.identify(email);
  }

  const columns: ColumnDef<Evaluation>[] = [
    {
      accessorKey: 'groupId',
      header: 'Group id',
      size: 120
    },
    {
      accessorKey: 'id',
      cell: (row) => <Mono>{String(row.getValue())}</Mono>,
      header: 'ID',
      size: 300
    },
    {
      accessorKey: 'name',
      header: 'Name',
      size: 300
    },
    {
      header: 'Created at',
      accessorKey: 'createdAt',
      cell: (row) => (
        <ClientTimestampFormatter timestamp={String(row.getValue())} />
      )
    }
  ];

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();

  const handleDeleteEvaluations = async (selectedRowIds: string[]) => {
    setIsDeleting(true);
    try {
      const response = await fetch(
        `/api/projects/${projectId}/evaluations?evaluationIds=${selectedRowIds.join(',')}`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          }
        }
      );

      if (response.ok) {
        mutate();

        toast({
          title: 'Evaluations deleted',
          description: `Successfully deleted ${selectedRowIds.length} evaluation(s).`,
        });
      } else {
        throw new Error('Failed to delete evaluations');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete evaluations. Please try again.',
        variant: 'destructive',
      });
    }
    setIsDeleting(false);
    setIsDeleteDialogOpen(false);
  };

  return (
    <div className="flex flex-col h-full">
      <Header path="evaluations" />
      <div className="flex justify-between items-center flex-none p-4">
        <h1 className="scroll-m-20 text-2xl font-medium flex items-center">
          Evaluations
        </h1>
      </div>
      <div className="flex-grow">
        <DataTable
          enableRowSelection={true}
          columns={columns}
          data={evaluations}
          onRowClick={(row) => {
            router.push(`/project/${projectId}/evaluations/${row.original.id}`);
          }}
          getRowId={(row: Evaluation) => row.id}
          paginated
          manualPagination
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
                    <DialogTitle>Delete Evaluations</DialogTitle>
                    <DialogDescription>
                      Are you sure you want to delete {selectedRowIds.length} evaluation(s)?
                      This action cannot be undone.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)} disabled={isDeleting}>
                      Cancel
                    </Button>
                    <Button onClick={() => handleDeleteEvaluations(selectedRowIds)} disabled={isDeleting}>
                      {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Delete
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          )}
        />
      </div>
    </div>
  );
}
