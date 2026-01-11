"use client";

import { get, isEmpty } from "lodash";
import { ArrowUpRight, Loader2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import React, { KeyboardEvent, useCallback, useEffect, useMemo } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { ResizableWrapper } from "@/components/traces/span-view/common";
import { Button } from "@/components/ui/button";
import ContentRenderer from "@/components/ui/content-renderer/index";
import DatasetSelect from "@/components/ui/dataset-select";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/lib/hooks/use-toast";
import { LabelingQueue, LabelingQueueItem } from "@/lib/queue/types";
import { cn } from "@/lib/utils";

import Header from "../ui/header";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "../ui/resizable";
import AnnotationInterface from "./annotation-interface";
import { QueueStoreProvider, useQueueStore } from "./queue-store";
import SchemaDefinitionDialog from "./schema-definition-dialog";

function QueueInner() {
  const { projectId } = useParams();
  const { toast } = useToast();

  const {
    currentItem,
    queue: storeQueue,
    setCurrentItem,
    setCurrentItemTarget,
    isLoading,
    setIsLoading,
    isValid,
    setIsValid,
    dataset,
    setDataset,
    getTarget,
    annotationSchema,
    height,
    setHeight,
  } = useQueueStore((state) => ({
    currentItem: state.currentItem,
    queue: state.queue,
    setCurrentItem: state.setCurrentItem,
    setCurrentItemTarget: state.setCurrentItemTarget,
    isLoading: state.isLoading,
    setIsLoading: state.setIsLoading,
    isValid: state.isValid,
    setIsValid: state.setIsValid,
    dataset: state.dataset,
    setDataset: state.setDataset,
    getTarget: state.getTarget,
    annotationSchema: state.annotationSchema,
    height: state.height,
    setHeight: state.setHeight,
  }));

  const states = useMemo(() => {
    const isEmpty = !currentItem || currentItem.count === 0;
    const isFirstItem = currentItem?.position === 1;
    const isLastItem = currentItem?.position === currentItem?.count;
    const isAnyLoading = !!isLoading;
    const isDatasetSelected = !!dataset;

    return {
      skip: isAnyLoading || isEmpty || !isValid,
      prev: isAnyLoading || isFirstItem || isEmpty || !isValid,
      next: isAnyLoading || isLastItem || isEmpty || !isValid,
      complete: isAnyLoading || !isDatasetSelected || isEmpty || !isValid,
    };
  }, [currentItem, isLoading, dataset, isValid]);

  const sourceInfo = useMemo(() => {
    if (!currentItem) return null;

    const source = get(currentItem.metadata, "source");

    if (source === "datapoint") {
      return {
        label: "datapoint",
        link: `/project/${projectId}/datasets/${get(currentItem.metadata, "datasetId")}?datapointId=${get(currentItem.metadata, "id")}`,
      };
    }

    if (source === "span") {
      return {
        label: "span",
        link: `/project/${projectId}/traces?traceId=${get(currentItem.metadata, "traceId")}&spanId=${get(currentItem.metadata, "id")}`,
      };
    }

    if (source === "sql") {
      return {
        label: "sql",
        link: `/project/${projectId}/sql/${get(currentItem.metadata, "id")}`,
      };
    }

    // No source - manually created
    return null;
  }, [currentItem, projectId]);

  const onChange = useCallback(
    (v: string) => {
      try {
        const parsedValue = JSON.parse(v);
        setIsValid(true);
        setCurrentItemTarget(parsedValue);
      } catch (e) {
        setIsValid(false);
      }
    },
    [setCurrentItemTarget, setIsValid]
  );

  const move = useCallback(
    async (
      refDate: string,
      refId: string,
      direction: "next" | "prev" = "next",
      load: "skip" | "move" | "first-load" | false = "move"
    ) => {
      try {
        setIsLoading(load);
        const response = await fetch(`/api/projects/${projectId}/queues/${storeQueue?.id}/move`, {
          method: "POST",
          body: JSON.stringify({ refDate, refId, direction }),
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
          setCurrentItem(null);
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
    [projectId, storeQueue?.id, toast, setCurrentItem, setIsLoading]
  );

  const remove = useCallback(
    async (skip: boolean = false) => {
      try {
        setIsLoading("skip");
        const response = await fetch(`/api/projects/${projectId}/queues/${storeQueue?.id}/remove`, {
          method: "POST",
          body: JSON.stringify({
            id: currentItem?.id,
            skip: skip,
            data: get(currentItem?.payload, "data", {}),
            target: getTarget(),
            metadata: get(currentItem?.payload, "metadata", {}),
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

        if (currentItem) {
          await move(currentItem.createdAt, currentItem.id, "next");
        }
      } catch (e) {
        toast({
          variant: "destructive",
          title: "Error",
          description: e instanceof Error ? e.message : "Failed to remove from queue. Please try again.",
        });
      } finally {
        setTimeout(() => setIsLoading(false), 5000);
      }
    },
    [setIsLoading, projectId, storeQueue?.id, currentItem, getTarget, dataset, toast, move]
  );

  useEffect(() => {
    // Use epoch date and empty UUID to get the first item
    move(new Date(0).toISOString(), "00000000-0000-0000-0000-000000000000", "next", "first-load");
  }, []);

  useHotkeys(
    "meta+up,ctrl+up",
    useCallback(
      (event: KeyboardEvent) => {
        event.preventDefault();
        if (currentItem && !states.next) {
          move(currentItem.createdAt, currentItem.id, "next");
        }
      },
      [currentItem, move, states.next]
    ),
    { enableOnFormTags: true }
  );

  useHotkeys(
    "meta+down,ctrl+down",
    useCallback(
      (event: KeyboardEvent) => {
        event.preventDefault();
        if (currentItem && !states.prev) {
          move(currentItem.createdAt, currentItem.id, "prev");
        }
      },
      [currentItem, move, states.prev]
    ),
    { enableOnFormTags: true }
  );

  useHotkeys(
    "meta+enter,ctrl+enter",
    useCallback(
      (event: KeyboardEvent) => {
        event.preventDefault();
        if (!states.complete) {
          remove();
        }
      },
      [states.complete, remove]
    ),
    { enableOnFormTags: true }
  );

  useHotkeys(
    "meta+right,ctrl+right",
    useCallback(
      (event: KeyboardEvent) => {
        event.preventDefault();
        if (!states.skip) {
          remove(true);
        }
      },
      [states.skip, remove]
    ),
    { enableOnFormTags: true }
  );

  return (
    <>
      <Header path={`labeling queues/${storeQueue?.name || "Queue"}`} />
      <ResizablePanelGroup className="px-4 pb-4" direction="horizontal">
        <ResizablePanel className="flex flex-1 flex-col overflow-hidden" minSize={20} defaultSize={50}>
          {isLoading === "first-load" ? (
            <div className="size-full flex flex-col flex-1 gap-2">
              <Skeleton className="h-6 w-20 mb-2" />
              <Skeleton className="h-8" />
              <Skeleton className="h-full" />
            </div>
          ) : currentItem && currentItem.count > 0 ? (
            <>
              <span className="mb-1">Payload</span>
              <div className="flex text-xs gap-1 text-nowrap truncate">
                {sourceInfo ? (
                  <>
                    <span className="text-secondary-foreground">Created from</span>
                    <Link className="flex text-xs items-center text-primary" href={sourceInfo.link}>
                      {sourceInfo.label}
                      <ArrowUpRight className="w-3 h-3" />
                    </Link>
                  </>
                ) : (
                  <span className="text-secondary-foreground">Created manually</span>
                )}
              </div>
              <div className="flex flex-1 overflow-hidden mt-2">
                <ResizableWrapper height={height} onHeightChange={setHeight}>
                  <ContentRenderer
                    presetKey={`labeling-queue-${storeQueue?.id}`}
                    codeEditorClassName="rounded-b"
                    className="rounded"
                    defaultMode="json"
                    readOnly
                    value={JSON.stringify(currentItem?.payload, null, 2)}
                  />
                </ResizableWrapper>
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-1 justify-center items-center size-full">
              <span className="text-lg">No items in the queue</span>
              <span className="text-secondary-foreground text-sm">Push items to queue from dataset or spans</span>
            </div>
          )}
        </ResizablePanel>
        <ResizableHandle withHandle className="z-30 bg-transparent ml-[14px]" />
        <ResizablePanel className="flex-1 flex-col flex border rounded bg-secondary" minSize={42} defaultSize={33}>
          <div className="flex p-4 py-2 border-b text-secondary-foreground justify-between w-full items-center">
            <span className="text-nowrap">
              {currentItem?.position || 0} of {currentItem?.count || 0}
            </span>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => remove(true)} disabled={states.skip} variant="outline">
                <span className="mr-2">Skip</span>
                <div className="flex items-center text-center text-xs opacity-75">⌘ + ›</div>
              </Button>
              <Button
                onClick={() => currentItem && move(currentItem.createdAt, currentItem.id, "prev")}
                disabled={states.prev}
                variant="outline"
              >
                <span className="mr-2">Prev</span>
                <div className="text-center text-xs opacity-75">⌘ + ↓</div>
              </Button>
              <Button
                onClick={() => currentItem && move(currentItem.createdAt, currentItem.id, "next")}
                disabled={states.next}
                variant="outline"
              >
                <span className="mr-2">Next</span>
                <div className="text-center text-xs opacity-75">⌘ + ↑</div>
              </Button>
              <Button onClick={() => remove()} disabled={states.complete}>
                <span className="mr-2">Complete</span>
                <div className="text-center text-xs opacity-75">⌘ + ⏎</div>
              </Button>
            </div>
          </div>
          <div className={cn("flex flex-col flex-1 relative overflow-hidden")}>
            {!!isLoading && (
              <div className="z-30 absolute inset-0 bg-background/40 backdrop-blur-xs flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            )}
            <div className="p-4">
              <Label className="text-xs" htmlFor="insert-dataset">
                Insert to dataset on complete
              </Label>
              <DatasetSelect className="mt-1" value={dataset} onChange={(dataset) => setDataset(dataset?.id)} />
            </div>
            <div className="flex flex-1 h-full flex-col overflow-auto p-4">
              <div className="flex items-center justify-between mb-2">
                <span>Target</span>
                <SchemaDefinitionDialog />
              </div>
              {annotationSchema && (
                <div className="mb-4 border-b pb-4">
                  <AnnotationInterface />
                </div>
              )}

              <span className="text-secondary-foreground text-xs mb-2">
                JSON data that will be written to the target key of the payload object.
              </span>
              <div className="flex flex-1 min-h-fit overflow-hidden">
                <ContentRenderer
                  codeEditorClassName="rounded-b"
                  className={cn("rounded", {
                    "border border-destructive/75": !isValid,
                  })}
                  defaultMode="json"
                  value={JSON.stringify(getTarget())}
                  onChange={onChange}
                />
              </div>
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </>
  );
}

export default function Queue({ queue }: { queue: LabelingQueue }) {
  return (
    <QueueStoreProvider queue={queue}>
      <QueueInner />
    </QueueStoreProvider>
  );
}
