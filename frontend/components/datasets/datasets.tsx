'use client';

import { Button } from '@/components/ui/button';


import { useProjectContext } from '@/contexts/project-context';
import { useRouter } from 'next/navigation';
import { Loader, MoreVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ColumnDef } from '@tanstack/react-table';
import { Dataset } from '@/lib/dataset/types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import useSWR from 'swr';
import CreateDatasetDialog from './create-dataset-dialog';
import UpdateDatasetDialog from './update-dataset-dialog';
import ClientTimestampFormatter from '../client-timestamp-formatter';
import { DataTable } from '../ui/datatable';
import Header from '../ui/header';
import { TableCell, TableRow } from '../ui/table';


interface DatasetsProps {
}

export default function Datasets({ }: DatasetsProps) {
  const { projectId } = useProjectContext();
  const fetcher = (url: string) => fetch(url).then(res => res.json());
  const router = useRouter();
  const { data, isLoading, mutate } = useSWR(`/api/projects/${projectId}/datasets/`, fetcher)

  const updateDataset = async (datasetId: string, dataset: Dataset) => {
    const res = await fetch(`/api/projects/${projectId}/datasets/${datasetId}`, {
      method: 'POST',
      body: JSON.stringify({
        newName: dataset.name,
      }),
    });
    res.json();
    mutate();
  }

  const deleteDataset = async (datasetId: string) => {
    const res = await fetch(`/api/projects/${projectId}/datasets/${datasetId}`, {
      method: 'DELETE',
    });
    mutate();
  }

  const columns: ColumnDef<Dataset>[] = [
    {
      accessorKey: "name",
      header: "name",
    },
    {
      header: "Created at",
      accessorKey: "createdAt",
      cell: (row) => <ClientTimestampFormatter timestamp={String(row.getValue())} />,
    },
    {
      id: "actions",
      cell: ({ row }) => {
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="p-0">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={(e) => { deleteDataset(row.original.id); e.stopPropagation() }}
              >
                Delete
              </DropdownMenuItem>
              <UpdateDatasetDialog oldDataset={row.original} doUpdate={updateDataset} isDropdown={true} />
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    }
  ]

  return (
    <div className="h-full flex flex-col">
      <Header path="datasets" />
      <div className="flex justify-between items-center p-4 h-14 flex-none">
        <div className='flex'>
          <h3 className="scroll-m-20 text-lg font-semibold tracking-tight">
            Datasets
          </h3>
          <Loader className={cn('m-2 hidden', isLoading ? 'animate-spin block' : '')} size={12} />
        </div>
        <CreateDatasetDialog />
      </div>
      <div className='flex-grow'>
        <DataTable
          onRowClick={(row) => {
            router.push(`/project/${projectId}/datasets/${row.id}`);
          }}
          columns={columns}
          data={data}
          emptyRow={
            <TableRow>
              <TableCell colSpan={columns.length} className='text-center text'>
                Create a new dataset to get started
              </TableCell>
            </TableRow>
          }
        />
      </div>
    </div>
  );
}
