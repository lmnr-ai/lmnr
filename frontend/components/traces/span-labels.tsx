import { Info, X } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import useSWR from 'swr';

import { useProjectContext } from '@/contexts/project-context';
import { eventEmitter } from '@/lib/event-emitter';
import { Span, SpanLabel } from '@/lib/traces/types';
import { cn, swrFetcher } from '@/lib/utils';

import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { Table, TableBody, TableCell, TableRow } from '../ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '../ui/tooltip';

interface SpanLabelsProps {
  span: Span;
}

export default function SpanLabels({ span }: SpanLabelsProps) {
  const { projectId } = useProjectContext();
  const searchParams = new URLSearchParams(useSearchParams().toString());

  const { data, isLoading, mutate } = useSWR<SpanLabel[]>(
    `/api/projects/${projectId}/spans/${span.spanId}/labels`,
    swrFetcher
  );

  useEffect(() => {
    const handleLabelAdded = () => {
      mutate();
    };
    eventEmitter.on('mutateSpanLabels', handleLabelAdded);

    return () => {
      eventEmitter.off('mutateSpanLabels', handleLabelAdded);
    };
  }, [mutate]);

  const removeLabel = async (labelId: string) => {
    const params = (searchParams.get('datapointId') && span.attributes['lmnr.span.type'] === 'EXECUTOR')
      ? `?datapointId=${searchParams.get('datapointId')}`
      : '';
    console.log(params);
    const response = await fetch(
      `/api/projects/${projectId}/spans/${span.spanId}/labels/${labelId}` + params,
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
      <div className="border rounded bg-card">
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
                  <TableCell>{Object.entries(label.valueMap).find(([k, v]) => v === label.value)?.[0] ?? ''}</TableCell>
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
          <div className="p-2 text-secondary-foreground text-sm">
            No labels
          </div>
        )}
      </div>
    </div>
  );
}
