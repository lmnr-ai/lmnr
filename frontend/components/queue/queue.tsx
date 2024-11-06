'use client';

import { useProjectContext } from '@/contexts/project-context';
import { LabelingQueueItem } from '@/lib/queue/types';
import { useEffect, useState } from 'react';
import { LabelClass, Span } from '@/lib/traces/types';
import { Labels } from './labels';
import { Button } from '../ui/button';
import { LabelingQueue } from '@/lib/queue/types';
import Header from '../ui/header';
import { ArrowDown, ArrowUp, Loader2, X } from "lucide-react";
import { Label } from '../ui/label';
import { ScrollArea } from '../ui/scroll-area';
import { isChatMessageList } from '@/lib/flow/utils';
import ChatMessageListTab from '../traces/chat-message-list-tab';
import Formatter from '../ui/formatter';

interface QueueProps {
  queue: LabelingQueue;
}

export default function Queue({ queue }: QueueProps) {

  const { projectId } = useProjectContext();

  const [data, setData] = useState<{
    queueData: LabelingQueueItem,
    span: Span,
    count: number,
    position: number
  } | null>(null);

  const [isRemoving, setIsRemoving] = useState(false);
  const [addedLabels, setAddedLabels] = useState<Array<{ value: number, labelClass: LabelClass }>>([]);

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
        action: data?.queueData.action,
        addedLabels
      })
    }).then(async (data) => {
      if (data.ok) {
        setAddedLabels([]);
        const json = await data.json();
        next(json.createdAt);
      }
    }).finally(() => {
      setIsRemoving(false);
    });
  };

  const removeLabel = (index: number) => {
    setAddedLabels(prev => prev.filter((_, i) => i !== index));
  };

  useEffect(() => {
    next((new Date(0)).toUTCString());
  }, []);

  console.log(addedLabels);

  return (
    <div className="flex flex-col w-full h-full">
      <div className="flex-none">
        <Header path={`labeling queues/${queue.name}`} />
      </div>
      <div className="flex-1 flex">
        <div className="flex-1 flex flex-col">
          <div className="flex-1">
            {data?.span ? (
              <div className="flex h-full w-full">
                <ScrollArea className="flex overflow-auto w-full mt-0">
                  <div className="flex flex-col max-h-0">
                    <div className="flex flex-col p-4 gap-4">
                      <Label className="text-xs text-secondary-foreground font-mono">Span id {data.span.spanId}</Label>
                      <div className="w-full h-full">
                        <div className="pb-2 font-medium text-lg">Input</div>
                        {isChatMessageList(data.span.input) ? (
                          <ChatMessageListTab messages={data.span.input} />
                        ) : (
                          <Formatter
                            className="max-h-1/3"
                            collapsible
                            value={JSON.stringify(data.span.input)}
                          />
                        )}
                      </div>
                      <div className="w-full h-full">
                        <div className="pb-2 font-medium text-lg">Output</div>
                        <Formatter
                          className="max-h-[600px]"
                          value={data.span.output}
                          collapsible
                        />
                      </div>
                    </div>
                  </div>
                </ScrollArea>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-secondary-foreground">
                No items in queue
              </div>
            )}
          </div>
        </div>
        <div className="flex-1 flex border-l">
          <div className="w-2/3 flex flex-col">
            <div className="flex-none p-4 py-2 border-b text-secondary-foreground flex justify-between items-center">
              {data && <span>Item {data?.position} of {data?.count}</span>}
              <div></div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  onClick={() => data?.queueData && next(data.queueData.createdAt, 'prev')}
                  disabled={!data || data.position <= 1}
                >
                  <ArrowDown size={16} className="mr-2" />
                  Prev
                </Button>
                <Button
                  variant="outline"
                  onClick={() => data?.queueData && next(data.queueData.createdAt, 'next')}
                  disabled={!data || data.position >= (data.count || 0)}
                >
                  <ArrowUp size={16} className="mr-2" />
                  Next
                </Button>
                <Button
                  onClick={remove}
                  disabled={isRemoving || !data}
                >
                  {isRemoving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Complete
                </Button>
              </div>
            </div>
            <div className="flex-1 p-4">
              <Label className="text-sm text-secondary-foreground">Labels to be added to the span</Label>
              <div className="mt-4 space-y-2">
                {addedLabels.map((label, index) => (
                  <div key={index} className="flex items-center justify-between p-2 border border-foreground/10 bg-muted rounded">
                    <span>{Object.entries(label.labelClass.valueMap).find(([key, value]) => value === label.value)?.[0]}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">{label.labelClass.name}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeLabel(index)}
                        className="h-6 px-2"
                      >
                        <X size={14} />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="w-1/3 p-4 border-l">
            <Labels
              span={data?.span}
              onAddLabel={(value, labelClass) => {
                const isDuplicateClass = addedLabels.some(
                  label => label.labelClass.id === labelClass.id
                );
                if (!isDuplicateClass) {
                  setAddedLabels(prev => [...prev, { value, labelClass }]);
                }
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
