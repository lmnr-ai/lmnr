'use client';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useProjectContext } from '@/contexts/project-context';
import { MoreVertical } from 'lucide-react';
import { swrFetcher } from '@/lib/utils';
import { ColumnDef } from '@tanstack/react-table';
import { Pipeline, PipelineVisibility } from '@/lib/pipeline/types';
import ClientTimestampFormatter from '../client-timestamp-formatter';
import useSWR from 'swr';
import { CreatePipelineDialog } from './create-pipeline-dialog';
import { UpdatePipelineDialog } from './update-pipeline-dialog';
import { useToast } from '@/lib/hooks/use-toast';
import { DataTable } from '../ui/datatable';
import { useRouter } from 'next/navigation';
import Header from '../ui/header';
import { TableCell, TableRow } from '../ui/table';

function capitalizeFirstLetter(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

export default function Pipelines() {
  const { projectId } = useProjectContext();
  const { data, mutate } = useSWR<Pipeline[]>(`/api/projects/${projectId}/pipelines/`, swrFetcher);
  const { toast } = useToast();

  const updateVisibility = async (oldPipeline: Pipeline, newVisibility: PipelineVisibility) => {
    const res = await fetch(`/api/projects/${projectId}/pipelines/${oldPipeline.id!}`, {
      method: 'POST',
      body: JSON.stringify({
        ...oldPipeline,
        visibility: newVisibility,
        projectId,
      })
    });
    const json = await res.json();
    mutate();

    if (newVisibility === 'PUBLIC') {
      navigator.clipboard.writeText(`https://www.lmnr.ai/pub/${oldPipeline.id!}`)
      toast({
        title: 'Share URL copied to clipboard',
      })
    } else if (newVisibility === 'PRIVATE') {
      toast({
        title: 'Pipeline has been changed to private',
      })
    }
  }

  const deletePipeline = async (pipelineId: string) => {
    const res = await fetch(`/api/projects/${projectId}/pipelines/${pipelineId}`, {
      method: 'DELETE'
    });
    mutate();
  }

  const columns: ColumnDef<Pipeline>[] = [
    {
      accessorKey: "id",
      cell: (row) => <span className='font-mono text-[12px]'>{String(row.getValue())}</span>,
      header: "ID",
      size: 320
    },
    {
      accessorKey: "name",
      header: "Name",
      size: 240
    },
    {
      header: "Created at",
      accessorFn: (pipeline) => {
        return pipeline.createdAt!
      },
      cell: (row) => <ClientTimestampFormatter timestamp={String(row.getValue())} />,
    },
    {
      id: "actions",
      cell: ({ row }) => {
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="p-0 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {/* {(row.original.visibility! === "PRIVATE") && (<DropdownMenuItem onClick={(e) => {
                updateVisibility(row.original, 'PUBLIC')
                e.stopPropagation()
              }}>
                Make public
              </DropdownMenuItem>
              )}
              {(row.original.visibility! === "PUBLIC") && (<DropdownMenuItem onClick={(e) => {
                updateVisibility(row.original, 'PRIVATE')
                e.stopPropagation()
              }}>
                Make private
              </DropdownMenuItem>
              )} */}
              {(row.original.visibility! === "PUBLIC") && (<DropdownMenuItem onClick={(e) => { e.stopPropagation() }}>
                <a target="_blank" href={`/pub/${row.original.id!}`} className='w-full h-full'>
                  View public
                </a>
              </DropdownMenuItem>
              )}
              <UpdatePipelineDialog oldPipeline={row.original} onUpdate={mutate} isDropdown={true} />
              <DropdownMenuItem onClick={(e) => {
                deletePipeline(row.original.id!)
                e.stopPropagation()
              }}>
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    }
  ]

  const router = useRouter();

  return (
    <div className='flex flex-col h-full'>
      <Header path="pipelines" />
      <div className="flex-grow flex flex-col">
        <div className="flex justify-between items-center flex-none p-4 h-14">
          <h3 className="scroll-m-20 text-lg font-semibold tracking-tight">
            Pipelines
          </h3>
          <CreatePipelineDialog onUpdate={mutate} />
        </div>
        <div className='flex-grow'>
          <DataTable
            className='w-full h-full'
            data={data}
            columns={[...columns]}
            onRowClick={(row) => {
              router.push(`/project/${projectId}/pipelines/${row.id}`)
              router.refresh()
            }}
            emptyRow={
              <TableRow>
                <TableCell colSpan={columns.length} className='text-center text'>
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
