import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';
import useSWR from 'swr';

import { useProjectContext } from '@/contexts/project-context';
import { eventEmitter } from '@/lib/event-emitter';
import { cn, swrFetcher } from '@/lib/utils';

import { Skeleton } from '../ui/skeleton';
import { Table, TableBody, TableCell, TableRow } from '../ui/table';

interface SpanDatasetsProps {
  spanId: string;
}

interface SpanDataset {
  datasetName: string;
  datasetId: string;
  datapointId: string;
}

export default function SpanDatasets({ spanId }: SpanDatasetsProps) {
  const { projectId } = useProjectContext();

  const { data, isLoading, mutate } = useSWR<SpanDataset[]>(
    `/api/projects/${projectId}/spans/${spanId}/datapoints`,
    swrFetcher
  );

  useEffect(() => {
    const handleDatapointAdded = () => {
      mutate();
    };
    eventEmitter.on('mutateSpanDatapoints', handleDatapointAdded);

    return () => {
      eventEmitter.off('mutateSpanDatapoints', handleDatapointAdded);
    };
  }, [mutate]);

  return (
    <div className="flex flex-col pb-2">
      <div className="pb-2 font-medium text-lg">Datasets</div>
      <div className="border rounded bg-card">
        {isLoading ? (
          <div>
            <Skeleton className="h-10 w-full" />
          </div>
        ) : data && data.length > 0 ? (
          <Table className="">
            <TableBody className="text-base">
              {data?.map((dataset: SpanDataset, index: number) => (
                <TableRow
                  key={dataset.datasetId}
                  className={cn(
                    'text-sm',
                    index === data.length - 1 ? 'border-b-0' : ''
                  )}
                >
                  <TableCell>
                    <div className="flex">
                      <div className="border-secondary-foreground/30 border p-0.5 px-3 bg-secondary rounded-full">
                        {dataset.datasetName}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-secondary-foreground">{dataset.datapointId}</TableCell>
                  <TableCell>
                    <Link href={`/project/${projectId}/datasets/${dataset.datasetId}?datapointId=${dataset.datapointId}`} target="_blank">
                      <ArrowUpRight className="text-secondary-foreground" size={16} />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="p-2 text-secondary-foreground text-sm">
            No datasets
          </div>
        )}
      </div>
    </div>
  );
}
