"use client";

import { get, isEmpty } from "lodash";
import { ArrowDown, ArrowUp, ArrowUpRight, Loader2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import CodeHighlighter from "@/components/traces/code-highlighter";
import { Button } from "@/components/ui/button";
import DatasetSelect from "@/components/ui/dataset-select";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/lib/hooks/use-toast";
import { LabelingQueue, LabelingQueueItem } from "@/lib/queue/types";
import { cn } from "@/lib/utils";

import Header from "../ui/header";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "../ui/resizable";

interface QueueProps {
  queue: LabelingQueue;
}

const getDefaultState = (
  id: string
): LabelingQueueItem & {
  count: number;
  position: number;
  payload: {
    data: Record<string, unknown>;
    target: Record<string, unknown>;
  };
} => ({
  count: 0,
  position: 0,
  id: "-",
  createdAt: "",
  queueId: id,
  metadata: "{}",
  payload: {
    data: {},
    target: {},
  },
});

export default function Queue({ queue }: QueueProps) {
  const { projectId } = useParams();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState<"skip" | "move" | "first-load" | false>("first-load");
  const [isValid, setIsValid] = useState(true);
  const [dataset, setDataset] = useState<string>();
  const [currentItem, setCurrentItem] = useState<
    LabelingQueueItem & {
      count: number;
      position: number;
      payload: {
        data: Record<string, unknown>;
        target: Record<string, unknown>;
      };
    }
  >(getDefaultState(queue.id));

  const states = useMemo(() => {
    const isEmpty = currentItem.count === 0;
    const isFirstItem = currentItem.position === 1;
    const isLastItem = currentItem.position === currentItem.count;
    const isAnyLoading = !!isLoading;
    const isDatasetSelected = !!dataset;

    return {
      skip: isAnyLoading || isEmpty || !isValid,
      prev: isAnyLoading || isFirstItem || isEmpty || !isValid,
      next: isAnyLoading || isLastItem || isEmpty || !isValid,
      complete: isAnyLoading || !isDatasetSelected || isEmpty || !isValid,
    };
  }, [currentItem.count, currentItem.position, isLoading, dataset, isValid]);

  const sourceLink = useMemo(() => {
    if (get(currentItem.metadata, "source") === "datapoint") {
      return `/project/${projectId}/datasets/${get(currentItem.metadata, "datasetId")}?datapointId=${get(currentItem.metadata, "id")}`;
    }

    if (get(currentItem.metadata, "source") === "span") {
      return `/project/${projectId}/traces?traceId=${get(currentItem.metadata, "traceId")}&spanId=${get(currentItem.metadata, "id")}`;
    }
    return `/project/${projectId}/labeling-queues/${queue.id}`;
  }, [currentItem.metadata, projectId, queue.id]);

  const onChange = useCallback((v: string) => {
    try {
      const parsedValue = JSON.parse(v);
      setIsValid(true);
      setCurrentItem((prev) => ({
        ...prev,
        payload: {
          ...prev.payload,
          target: parsedValue,
        },
      }));
    } catch (e) {
      setIsValid(false);
    }
  }, []);

  const move = useCallback(
    async (
      refDate: string,
      direction: "next" | "prev" = "next",
      load: "skip" | "move" | "first-load" | false = "move"
    ) => {
      try {
        setIsLoading(load);
        const response = await fetch(`/api/projects/${projectId}/queues/${queue.id}/move`, {
          method: "POST",
          body: JSON.stringify({ refDate, direction }),
        });
        if (!response.ok) {
          toast({ variant: "destructive", title: "Error", description: "Failed to move queue. Please try again." });
        }
        const data = (await response.json()) as LabelingQueueItem & {
          count: number;
          position: number;
          payload: { data: Record<string, unknown>; target: Record<string, unknown> };
        };

        if (!isEmpty(data)) {
          setCurrentItem({
            ...data,
            payload: data.payload,
          });
        } else {
          setCurrentItem(getDefaultState(queue.id));
        }
      } catch (e) {
        toast({
          variant: "destructive",
          title: "Error",
          description: e instanceof Error ? e.message : "Failed to move queue. Please try again.",
        });
      } finally {
        setTimeout(() => setIsLoading(false), 300);
      }
    },
    [projectId, queue.id, toast]
  );

  const remove = useCallback(
    async (skip: boolean = false) => {
      try {
        setIsLoading("skip");
        const response = await fetch(`/api/projects/${projectId}/queues/${queue.id}/remove`, {
          method: "POST",
          body: JSON.stringify({
            id: currentItem.id,
            skip: skip,
            data: get(currentItem.payload, "data", {}),
            target: get(currentItem.payload, "target", {}),
            metadata: get(currentItem.payload, "metadata", {}),
            datasetId: dataset,
          }),
        });
        if (!response.ok) {
          toast({
            variant: "destructive",
            title: "Error",
            description: "Failed to remove from queue. Please try again.",
          });
          setIsLoading(false);
          return;
        }

        await move(currentItem.createdAt);
      } catch (e) {
        console.log(e);
        toast({
          variant: "destructive",
          title: "Error",
          description: e instanceof Error ? e.message : "Failed to remove from queue. Please try again.",
        });
      } finally {
        setTimeout(() => setIsLoading(false), 5000);
      }
    },
    [currentItem.createdAt, currentItem.id, currentItem.payload, dataset, move, projectId, queue.id, toast]
  );

  useEffect(() => {
    move(new Date(0).toISOString(), "next", "first-load");
  }, []);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header path={`labeling queues/${queue.name}`} />
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel className="flex flex-1 flex-col overflow-hidden p-4" minSize={20} defaultSize={50}>
          {isLoading === "first-load" ? (
            <div className="size-full flex flex-col flex-1 gap-2">
              <Skeleton className="h-6 w-20 mb-2" />
              <Skeleton className="h-8" />
              <Skeleton className="h-full" />
            </div>
          ) : currentItem.count > 0 ? (
            <>
              <span className="mb-1">Payload</span>
              <div className="flex text-xs gap-1 text-nowrap truncate">
                <span className="text-secondary-foreground">Created from</span>
                <Link className="flex text-xs items-center text-primary" href={sourceLink}>
                  {get(currentItem.metadata, "source", "-")}
                  <ArrowUpRight className="w-3 h-3" />
                </Link>
              </div>
              <div className="flex flex-1 overflow-hidden mt-2">
                <CodeHighlighter
                  codeEditorClassName="rounded-b"
                  className="rounded"
                  defaultMode="json"
                  readOnly
                  value={JSON.stringify(currentItem.payload, null, 2)}
                />
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-1 justify-center items-center size-full">
              <span className="text-lg">No items in the queue</span>
              <span className="text-secondary-foreground text-sm">Push items to queue from dataset or spans</span>
            </div>
          )}
        </ResizablePanel>
        <ResizableHandle withHandle className="z-50" />
        <ResizablePanel className="flex-1 flex-col flex" minSize={20} defaultSize={33}>
          <div className="flex gap-2 p-4 py-2 border-b text-secondary-foreground justify-between items-center">
            <span className="text-nowrap">
              Item {currentItem.position} of {currentItem.count}
            </span>
            <div className="flex flex-wrap justify-end items-center gap-2">
              <Button onClick={() => remove(true)} disabled={states.skip} variant="outline">
                Skip
              </Button>
              <Button onClick={() => move(currentItem.createdAt, "prev")} disabled={states.prev} variant="outline">
                <ArrowDown size={16} className="mr-2" />
                Prev
              </Button>
              <Button onClick={() => move(currentItem.createdAt, "next")} disabled={states.next} variant="outline">
                <ArrowUp size={16} className="mr-2" />
                Next
              </Button>
              <Button onClick={() => remove()} disabled={states.complete}>
                Complete
              </Button>
            </div>
          </div>
          <div className={cn("flex flex-col flex-1 relative overflow-hidden z-50")}>
            {!!isLoading && (
              <div className="z-50 absolute inset-0 bg-background/40 backdrop-blur-sm flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            )}
            <div className="p-4 border-b">
              <Label htmlFor="insert-dataset">Insert to dataset on complete</Label>
              <DatasetSelect className="mt-2" value={dataset} onChange={(dataset) => setDataset(dataset.id)} />
            </div>
            <div className="flex flex-1 h-full flex-col overflow-hidden p-4">
              <span className="mb-1">Target</span>
              <span className="text-secondary-foreground text-xs mb-2">
                Data that will be written to the target key of the payload object. It can contain any valid JSON
                structure.
              </span>
              <div className="flex flex-1 overflow-hidden">
                <CodeHighlighter
                  codeEditorClassName="rounded-b"
                  className={cn("rounded", {
                    "border border-destructive/75": !isValid,
                  })}
                  defaultMode="json"
                  value={JSON.stringify(currentItem.payload.target)}
                  onChange={onChange}
                />
              </div>
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
