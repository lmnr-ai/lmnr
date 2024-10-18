import { useProjectContext } from '@/contexts/project-context';
import { LabelSource, SpanLabel } from '@/lib/traces/types';
import { cn, swrFetcher } from '@/lib/utils';
import useSWR from 'swr';
import { DataTable } from '../ui/datatable';
import { useEffect } from 'react';
import { ColumnDef } from '@tanstack/react-table';

import { eventEmitter } from '@/lib/event-emitter';
import { Table, TableBody, TableCell, TableRow } from '../ui/table';
import { Skeleton } from '../ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '../ui/tooltip';
import ClientTimestampFormatter from '../client-timestamp-formatter';
import { Button } from '../ui/button';
import { Info, X } from 'lucide-react';

interface SpanLabelsProps {
  spanId: string;
}

export default function SpanLabels({ spanId }: SpanLabelsProps) {
  const { projectId } = useProjectContext();

  const { data, isLoading, mutate } = useSWR<SpanLabel[]>(
    `/api/projects/${projectId}/spans/${spanId}/labels`,
    swrFetcher
  );

  useEffect(() => {
    const handleLabelAdded = () => {
      mutate();
    };
    eventEmitter.on('labelAdded', handleLabelAdded);

    return () => {
      eventEmitter.off('labelAdded', handleLabelAdded);
    };
  }, [mutate]);

  const columns: ColumnDef<SpanLabel>[] = [
    {
      accessorKey: 'className',
      header: 'Name'
    },
    {
      accessorKey: 'labelType',
      header: 'Type'
    },
    {
      accessorFn: (row: SpanLabel) => row.valueMap?.[row.value] ?? '',
      header: 'Value'
    },
    {
      accessorFn: (row: SpanLabel) =>
        row.userEmail ??
        (row.labelSource === LabelSource.AUTO ? 'Auto-labeled' : '-'),
      header: 'User'
    },
    {
      accessorKey: 'updatedAt',
      header: 'Updated At',
      cell: (row) => (
        <ClientTimestampFormatter timestamp={String(row.getValue())} />
      )
    }
  ];

  const removeLabel = async (labelId: string) => {
    const response = await fetch(
      `/api/projects/${projectId}/spans/${spanId}/labels/${labelId}`,
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.ok) {
      mutate();
    }
  };

  return (
    <div className="flex flex-col pb-2">
      <div className="pb-2 font-medium text-lg">Labels</div>
      <div className="border rounded">
        {isLoading ? (
          <div>
            <Skeleton className="h-10 w-full" />
          </div>
        ) : data && data.length > 0 ? (
          <Table className="">
            <TableBody className="text-base">
              {data?.map((label: SpanLabel, index: number) => (
                <TableRow
                  key={label.id}
                  className={cn(
                    'text-sm',
                    index === data.length - 1 ? 'border-b-0' : ''
                  )}
                >
                  <TableCell>
                    <div className="flex">
                      <div className="border-secondary-foreground/30 border p-0.5 px-3 bg-secondary rounded-full">
                        {label.className}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {label.reasoning && (
                      <TooltipProvider delayDuration={0}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center text-secondary-foreground">
                              <span className="text-sm">Reasoning</span>
                              <Info size={14} className="ml-1" />
                            </div>
                          </TooltipTrigger>
                          {label.reasoning && (
                            <TooltipContent side="bottom" align="start">
                              <div className="text-sm w-[400px] p-2 text-secondary-foreground">
                                <p>{label.reasoning}</p>
                              </div>
                            </TooltipContent>
                          )}
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </TableCell>
                  <TableCell>{label.labelSource}</TableCell>
                  <TableCell>{label.valueMap?.[label.value] ?? ''}</TableCell>
                  <TableCell>{label.userEmail}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        removeLabel(label.id);
                      }}
                    >
                      <X size={14} />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="p-2 text-secondary-foreground bg-secondary text-sm">
            No labels
          </div>
        )}
      </div>
    </div>
  );
}
