"use client";

import { ArrowDown, ArrowUp, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";

import { useProjectContext } from "@/contexts/project-context";
import { isChatMessageList } from "@/lib/flow/utils";
import { LabelingQueue, LabelingQueueItem } from "@/lib/queue/types";
import { LabelClass, Span } from "@/lib/traces/types";

import ChatMessageListTab from "../traces/chat-message-list-tab";
import { Button } from "../ui/button";
import DatasetSelect from "../ui/dataset-select";
import DefaultTextarea from "../ui/default-textarea";
import Formatter from "../ui/formatter";
import Header from "../ui/header";
import { Label } from "../ui/label";
import MonoWithCopy from "../ui/mono-with-copy";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "../ui/resizable";
import { ScrollArea } from "../ui/scroll-area";
import { Skeleton } from "../ui/skeleton";
import { Switch } from "../ui/switch";
import { Labels } from "./labels";

interface QueueProps {
  queue: LabelingQueue;
}

export default function Queue({ queue }: QueueProps) {
  const { projectId } = useProjectContext();

  const [data, setData] = useState<
    | {
        queueData: LabelingQueueItem;
        span: Span;
        count: number;
        position: number;
      }[]
    | null
  >(null);

  const [isRemoving, setIsRemoving] = useState(false);
  const [addedLabels, setAddedLabels] = useState<
    Array<{
      labelClass: LabelClass;
      reasoning?: string | null;
    }>
  >([]);
  const [datasetId, setDatasetId] = useState<string | undefined>(undefined);
  const [insertOnComplete, setInsertOnComplete] = useState(false);

  const next = (refDate: string, direction: "next" | "prev" = "next") => {
    fetch(`/api/projects/${projectId}/queues/${queue.id}/move`, {
      method: "POST",
      body: JSON.stringify({ refDate, direction }),
    }).then(async (data) => {
      if (data.ok) {
        const json = await data.json();
        setData(json);
      }
    });
  };

  const remove = () => {
    setIsRemoving(true);

    // TODO: refactor when we have structured actions
    let action = data?.[0]?.queueData.action as { resultId: string; datasetId?: string };
    if (datasetId) {
      action.datasetId = datasetId;
    }

    fetch(`/api/projects/${projectId}/queues/${queue.id}/remove`, {
      method: "POST",
      body: JSON.stringify({
        id: data?.[0]?.queueData.id,
        spanId: data?.[0]?.span.spanId,
        action,
        addedLabels,
      }),
    })
      .then(async (data) => {
        if (data.ok) {
          setAddedLabels([]);
          const json = await data.json();
          next(json.createdAt);
        }
      })
      .finally(() => {
        setIsRemoving(false);
      });
  };

  const removeLabel = (index: number) => {
    setAddedLabels((prev) => prev.filter((_, i) => i !== index));
  };

  useEffect(() => {
    next(new Date(0).toUTCString());
  }, []);

  return (
    <div className="flex flex-col w-full h-full">
      <div className="flex-none">
        <Header path={`labeling queues/${queue.name}`} />
      </div>
      <div className="flex-1 flex">
        <ResizablePanelGroup direction="horizontal">
          <ResizablePanel className="flex-1 flex" minSize={20} defaultSize={50}>
            {data?.[0]?.span && (
              <div className="flex h-full w-full">
                <ScrollArea className="flex overflow-auto w-full mt-0">
                  <div className="flex flex-col max-h-0">
                    <div className="flex flex-col p-4 gap-4">
                      <div className="flex items-center space-x-2">
                        <Label className="text-sm text-secondary-foreground font-mono">Span</Label>
                        <MonoWithCopy className="text-secondary-foreground">{data?.[0]?.span.spanId}</MonoWithCopy>
                      </div>
                      <div className="w-full h-full">
                        <div className="pb-2 font-medium text-lg">Input</div>
                        {isChatMessageList(data?.[0]?.span.input) ? (
                          <ChatMessageListTab reversed={false} messages={data?.[0]?.span.input} />
                        ) : (
                          <Formatter
                            className="max-h-1/3"
                            collapsible
                            value={JSON.stringify(data?.[0]?.span.input)}
                            presetKey={`input-${queue.id}`}
                          />
                        )}
                      </div>
                      <div className="w-full h-full">
                        <div className="pb-2 font-medium text-lg">Output</div>
                        <Formatter
                          className="max-h-[600px]"
                          value={JSON.stringify(data?.[0]?.span.output)}
                          collapsible
                        />
                      </div>
                    </div>
                  </div>
                </ScrollArea>
              </div>
            )}
            {data && data.length === 0 && (
              <div className="h-full p-4 flex w-full flex-col gap-2">
                <span className="text-secondary-foreground">No items in queue.</span>
              </div>
            )}
            {!data && (
              <div className="h-full p-4 flex w-full flex-col gap-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            )}
          </ResizablePanel>
          <ResizableHandle withHandle className="z-50" />
          <ResizablePanel className="flex-1 flex" minSize={20} defaultSize={33}>
            <div className="w-full flex flex-col">
              <div className="flex-none p-4 py-2 border-b text-secondary-foreground flex justify-between items-center">
                {data && (
                  <span>
                    Item {data[0]?.position} of {data[0]?.count}
                  </span>
                )}
                <div></div>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    onClick={() => data?.[0]?.queueData && next(data[0].queueData.createdAt, "prev")}
                    disabled={!data || data[0]?.position <= 1}
                  >
                    <ArrowDown size={16} className="mr-2" />
                    Prev
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => data?.[0]?.queueData && next(data[0].queueData.createdAt, "next")}
                    disabled={!data || data[0]?.position >= (data[0]?.count || 0)}
                  >
                    <ArrowUp size={16} className="mr-2" />
                    Next
                  </Button>
                  <Button onClick={remove} disabled={isRemoving || !data}>
                    {isRemoving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Complete
                  </Button>
                </div>
              </div>
              <div className="flex-1 p-4">
                <Label className="text-sm text-secondary-foreground">Labels to be added to the span</Label>
                <div className="mt-4 space-y-2">
                  {addedLabels.map((label, index) => (
                    <div key={index} className="flex flex-col p-2 border border-foreground/10 bg-muted rounded gap-2">
                      <div className="flex items-center gap-2 justify-between w-full">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">{label.labelClass.name}</span>
                          <Button variant="ghost" size="sm" onClick={() => removeLabel(index)} className="h-6 px-2">
                            <X size={14} />
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <DefaultTextarea
                          className="w-full"
                          placeholder="Reasoning (optional)"
                          value={label.reasoning || ""}
                          onChange={(e) => {
                            setAddedLabels((prev) =>
                              prev.map((l) =>
                                l.labelClass.id === label.labelClass.id ? { ...l, reasoning: e.target.value } : l
                              )
                            );
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex-none p-4 border-t">
                <div className="flex items-center justify-between">
                  <Label htmlFor="insert-dataset">Insert to dataset on complete</Label>
                  <Switch checked={insertOnComplete} onCheckedChange={setInsertOnComplete} id="insert-dataset" />
                </div>

                {insertOnComplete && (
                  <div className="mt-4">
                    <DatasetSelect
                      selectedDatasetId={datasetId}
                      onDatasetChange={(dataset) => {
                        setDatasetId(dataset?.id || undefined);
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle className="z-50" />
          <ResizablePanel className="w-1/3 p-4 border-l" minSize={10} defaultSize={17}>
            <Labels
              span={data?.[0]?.span}
              onAddLabel={(labelClass) => {
                const isDuplicateClass = addedLabels.some((label) => label.labelClass.id === labelClass.id);
                if (!isDuplicateClass) {
                  setAddedLabels((prev) => [...prev, { labelClass, reasoning: null }]);
                }
              }}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
