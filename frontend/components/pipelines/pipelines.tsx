'use client';

import { ColumnDef } from '@tanstack/react-table';
import { MoreVertical } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { usePostHog } from 'posthog-js/react';
import useSWR from 'swr';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { useProjectContext } from '@/contexts/project-context';
import { useUserContext } from '@/contexts/user-context';
import { Feature, isFeatureEnabled } from '@/lib/features/features';
import { Pipeline } from '@/lib/pipeline/types';
import { swrFetcher } from '@/lib/utils';

import ClientTimestampFormatter from '../client-timestamp-formatter';
import { DataTable } from '../ui/datatable';
import Header from '../ui/header';
import { TableCell, TableRow } from '../ui/table';
import { CreatePipelineDialog } from './create-pipeline-dialog';
import { UpdatePipelineDialog } from './update-pipeline-dialog';

export default function Pipelines() {
  const { projectId } = useProjectContext();
  const { data, mutate } = useSWR<Pipeline[]>(
    `/api/projects/${projectId}/pipelines/`,
    swrFetcher
  );
  const posthog = usePostHog();
  const { email } = useUserContext();

  if (isFeatureEnabled(Feature.POSTHOG)) {
    posthog.identify(email);
  }

  const deletePipeline = async (pipelineId: string) => {
    const res = await fetch(
      `/api/projects/${projectId}/pipelines/${pipelineId}`,
      {
        method: 'DELETE'
      }
    );
    mutate();
  };

  const columns: ColumnDef<Pipeline>[] = [
    {
      accessorKey: 'id',
      cell: (row) => (
        <span className="font-mono text-[12px]">{String(row.getValue())}</span>
      ),
      header: 'ID',
      size: 320
    },
    {
      accessorKey: 'name',
      header: 'Name',
      size: 240
    },
    {
      header: 'Created at',
      accessorFn: (pipeline) => pipeline.createdAt!,
      cell: (row) => (
        <ClientTimestampFormatter timestamp={String(row.getValue())} />
      )
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="p-0 w-8">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {row.original.visibility! === 'PUBLIC' && (
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                }}
              >
                <a
                  target="_blank"
                  href={`/pub/${row.original.id!}`}
                  className="w-full h-full"
                >
                  View public
                </a>
              </DropdownMenuItem>
            )}
            <UpdatePipelineDialog
              oldPipeline={row.original}
              onUpdate={mutate}
              isDropdown={true}
            />
            <DropdownMenuItem
              onClick={(e) => {
                deletePipeline(row.original.id!);
                e.stopPropagation();
              }}
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    }
  ];

  const router = useRouter();

  return (
    <div className="flex flex-col h-full">
      <Header path="pipelines" />
      <div className="flex-grow flex flex-col">
        <div className="flex justify-between items-center flex-none p-4 h-14">
          <h3 className="scroll-m-20 text-lg font-semibold tracking-tight">
            Pipelines
          </h3>
          <CreatePipelineDialog onUpdate={mutate} />
        </div>
        <div className="flex-grow">
          <DataTable
            className="w-full h-full"
            data={data}
            columns={[...columns]}
            onRowClick={(row) => {
              router.push(`/project/${projectId}/pipelines/${row.original.id}`);
              router.refresh();
            }}
            emptyRow={
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="text-center text"
                >
                  Create a new pipeline to get started
                </TableCell>
              </TableRow>
            }
          />
        </div>
      </div>
    </div>
  );
}
