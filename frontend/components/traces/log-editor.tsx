import { RunTrace, TracePreview, TraceWithSpanPreviews } from '@/lib/traces/types';
import { ChevronsRight } from 'lucide-react';
import TraceCards from './trace-cards';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/utils';
import { useProjectContext } from '@/contexts/project-context';
import { Skeleton } from '../ui/skeleton';
import { Button } from '../ui/button';
import Mono from '../ui/mono';

interface LogEditorProps {
  onClose: () => void;
  traceId: string;
}

export default function LogEditor({ onClose, traceId }: LogEditorProps) {
  const { projectId } = useProjectContext();
  const { data: rowInfo, isLoading, error } = useSWR(`/api/projects/${projectId}/traces/${traceId}`, swrFetcher);

  const renderTrace = () => {
    if (isLoading) return (
      <div className='w-full p-4 h-full flex flex-col space-y-2'>
        <Skeleton className='w-full h-8' />
        <Skeleton className='w-full h-8' />
        <Skeleton className='w-full h-8' />
      </div>
    );

    if (error) return <div className='m-2 text-rose-900'>Error fetching trace. Please try again</div>;
    if (!rowInfo) return <div className='m-2 text-rose-900'>No trace found for this run id</div>;

    return (
      <TraceCards
        trace={rowInfo as TraceWithSpanPreviews}
        enableFeedback
      />
    )
  }

  return (
    <div className='flex flex-col h-full w-full overflow-clip'>
      <div className='h-12 flex flex-none items-center border-b space-x-2 pl-3'>
        <Button
          variant={'ghost'}
          className='px-1'
          onClick={onClose}
        >
          <ChevronsRight />
        </Button>
        <div>
          Trace
        </div>
        <Mono className='text-secondary-foreground'>
          {traceId}
        </Mono>
      </div>
      <div className='flex-grow flex'>
        {
          renderTrace()
        }
      </div>
    </div>
  );
}
