'use client';

import { useProjectContext } from '@/contexts/project-context';
import { Evaluation } from '@/lib/evaluation/types';
import { ColumnDef } from '@tanstack/react-table';
import ClientTimestampFormatter from '../client-timestamp-formatter';
import { useRouter, useSearchParams } from 'next/navigation';
import { DataTable } from '../ui/datatable';
import Mono from '../ui/mono';
import Header from '../ui/header';
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
import EvaluationsGroupsBar from './evaluations-groups-bar';
import { Skeleton } from '../ui/skeleton';
import ProgressionChart from './progression-chart';
import { AggregationFunction } from '@/lib/clickhouse/utils';
import { Select, SelectItem, SelectValue, SelectTrigger, SelectContent } from '../ui/select';

export default function Evaluations() {
  const { projectId } = useProjectContext();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data, mutate } = useSWR<PaginatedResponse<Evaluation>>(
    `/api/projects/${projectId}/evaluations?groupId=${searchParams.get('groupId')}`,
    swrFetcher
  );
  const evaluations = data?.items;

  const [aggregationFunction, setAggregationFunction] = useState<AggregationFunction>('AVG');

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
      <div className = "flex h-full">
        <EvaluationsGroupsBar />
        <div className="flex flex-col h-full flex-1 space-y-4">
          <div className="flex justify-start items-center flex-none p-4 space-x-4">
            <h1 className="scroll-m-20 text-2xl font-medium flex items-center flex-none">
              Evaluations
            </h1>
            <Select
              value={aggregationFunction}
              onValueChange={(value) => setAggregationFunction(value as AggregationFunction)}
            >
              <SelectTrigger className="flex-none max-w-32 mt-1.5">
                <SelectValue placeholder="Aggregate" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="AVG">Average</SelectItem>
                <SelectItem value="SUM">Sum</SelectItem>
                <SelectItem value="MIN">Minimum</SelectItem>
                <SelectItem value="MAX">Maximum</SelectItem>
                <SelectItem value="MEDIAN">Median</SelectItem>
                <SelectItem value="p90">p90</SelectItem>
                <SelectItem value="p95">p95</SelectItem>
                <SelectItem value="p99">p99</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <ProgressionChart className="h-64 flex-none px-2" aggregationFunction={aggregationFunction} />
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
      </div>
    </div>
  );
}
