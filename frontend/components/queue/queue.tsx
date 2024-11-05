'use client';

import { useProjectContext } from '@/contexts/project-context';
import { LabelingQueueData } from '@/lib/queue/types';
import { useEffect, useState } from 'react';
import { SpanViewSpan } from '../traces/span-view-span';
import { Span } from '@/lib/traces/types';
import { Labels } from './labels';
import { Button } from '../ui/button';
import { LabelingQueue } from '@/lib/queue/types';
import Header from '../ui/header';
import { Loader2 } from "lucide-react";

interface QueueProps {
  queue: LabelingQueue;
}

export default function Queue({ queue }: QueueProps) {

  const { projectId } = useProjectContext();

  const [data, setData] = useState<{
    queueData: LabelingQueueData,
    span: Span,
    count: number,
    position: number
  } | null>(null);

  const [isRemoving, setIsRemoving] = useState(false);

  const next = (refDate: string, direction: 'next' | 'prev' = 'next') => {
    fetch(`/api/projects/${projectId}/queues/${queue.id}/move`, {
      method: 'POST',
      body: JSON.stringify({ refDate, direction })
    }).then(async (data) => {
      if (data.ok) {
        const json = await data.json();
        setData(json);
      }
    });
  };

  const remove = () => {
    setIsRemoving(true);
    fetch(`/api/projects/${projectId}/queues/${queue.id}/remove`, {
      method: 'POST',
      body: JSON.stringify({
        id: data?.queueData.id,
        spanId: data?.span.spanId,
        action: data?.queueData.action
      })
    }).then(async (data) => {
      if (data.ok) {
        const json = await data.json();
        next(json.createdAt);
      }
    }).finally(() => {
      setIsRemoving(false);
    });
  };

  useEffect(() => {
    next((new Date(0)).toUTCString());
  }, []);

  return (
    <div className="flex flex-col w-full h-full">
      <div className="flex-none">
        <Header path={`labeling queues/${queue.name}`} />
      </div>
      <div className="flex-1 flex">
        <div className="flex-1 flex flex-col">
          <div className="flex-none p-4 py-2 border-b text-secondary-foreground flex justify-between items-center">
            <Button
              variant="ghost"
              onClick={() => data?.queueData && next(data.queueData.createdAt, 'prev')}
              disabled={!data || data.position <= 1}
            >
              Previous
            </Button>
            <span>Item {data?.position} of {data?.count}</span>
            <Button
              variant="ghost"
              onClick={() => data?.queueData && next(data.queueData.createdAt, 'next')}
              disabled={!data || data.position >= (data.count || 0)}
            >
              Next
            </Button>
          </div>
          <div className="flex-1">
            {data?.span ? (
              <SpanViewSpan span={data.span} />
            ) : (
              <div className="h-full flex items-center justify-center text-secondary-foreground">
                No items in queue
              </div>
            )}
          </div>
        </div>
        <div className="flex-1 flex flex-col border-l">
          <div className="flex-1 p-4">
            <Labels span={data?.span} />
          </div>
          <div className="flex-none border-t p-4 flex justify-end">
            <Button
              onClick={remove}
              disabled={isRemoving}
            >
              {isRemoving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Complete
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
