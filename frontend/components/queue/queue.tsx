"use client";

import { get } from "lodash";
import { ArrowUpRight, Check, ChevronDown, ChevronLeft, ChevronRight, Loader2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import useSWR from "swr";

import { Button } from "@/components/ui/button";
import ContentRenderer from "@/components/ui/content-renderer/index";
import DatasetSelect from "@/components/ui/dataset-select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Header from "@/components/ui/header";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/lib/hooks/use-toast";
import { type LabelingQueue, type LabelingQueueItem } from "@/lib/queue/types";
import { cn, swrFetcher } from "@/lib/utils";

import AnnotationInterface from "./annotation-interface";
import { QueueStoreProvider, useQueueStore } from "./queue-store";
import SchemaDefinitionDialog from "./schema-definition-dialog";

interface QueueItemsResponse {
  items: LabelingQueueItem[];
  progress: { total: number; labelled: number };
}

function QueueInner() {
  const { projectId } = useParams();
  const { toast } = useToast();

  const queue = useQueueStore((s) => s.queue);
  const items = useQueueStore((s) => s.items);
  const currentIndex = useQueueStore((s) => s.currentIndex);
  const ioState = useQueueStore((s) => s.ioState);
  const dataset = useQueueStore((s) => s.dataset);
  const annotationSchema = useQueueStore((s) => s.annotationSchema);
  const fields = useQueueStore((s) => s.fields);
  const isTargetJsonValid = useQueueStore((s) => s.isTargetJsonValid);
  const dirtyItemIds = useQueueStore((s) => s.dirtyItemIds);

  const setItems = useQueueStore((s) => s.setItems);
  const setCurrentIndex = useQueueStore((s) => s.setCurrentIndex);
  const step = useQueueStore((s) => s.step);
  const setIoState = useQueueStore((s) => s.setIoState);
  const setDataset = useQueueStore((s) => s.setDataset);
  const setTarget = useQueueStore((s) => s.setTarget);
  const setTargetJsonValid = useQueueStore((s) => s.setTargetJsonValid);
  const markLabelled = useQueueStore((s) => s.markLabelled);
  const removeItemLocal = useQueueStore((s) => s.removeItem);

  const queueId = queue?.id;
  const currentItem = items[currentIndex];

  const { data, error, isLoading, mutate } = useSWR<QueueItemsResponse>(
    queueId ? `/api/projects/${projectId}/queues/${queueId}/items` : null,
    swrFetcher
  );

  useEffect(() => {
    if (data?.items) {
      setItems(data.items);
    }
  }, [data, setItems]);

  useEffect(() => {
    if (error) {
      toast({ variant: "destructive", title: "Failed to load queue items" });
    }
  }, [error, toast]);

  const progress = useMemo(() => {
    // Prefer the server-side FINAL count — it's authoritative and matches even if
    // the loaded item list ever gets paginated/capped. Fall back to items.length
    // before the first fetch completes so the bar doesn't flash at 0.
    const total = data?.progress.total ?? items.length;
    const labelled = items.filter((i) => i.isLabelled).length;
    return { total, labelled };
  }, [items, data?.progress.total]);

  const progressPct = progress.total === 0 ? 0 : Math.round((progress.labelled / progress.total) * 100);

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
    return null;
  }, [currentItem, projectId]);

  // Per-item debounced target save. Every dirty item tracks its own timer + in-flight abort
  // controller, keyed by item id. This is deliberately NOT a `useDebounce` on `currentItem`:
  // if the user edits A then navigates to B within the 600 ms window, a single shared timer
  // would be cleared by the currentItem→B transition and A's edit would be silently lost.
  // The per-id map lets A's timer keep ticking while B gets its own independent one.
  //
  // `lastSavedKey` guards against re-firing a save for an id whose content hasn't changed
  // since its last attempt (rerenders would otherwise re-schedule identical PATCHes).
  //
  // `abortByItemId` lets approve/discard cancel a specific item's in-flight/not-yet-fired
  // save so a stale `isLabelled:false` PATCH can't land after `isLabelled:true` and —
  // since ClickHouse RMT resolves by updated_at — revert the approval (same reasoning
  // applies to discard: a late re-insert with a fresher updated_at would resurrect a
  // row past its delete tombstone).
  const saveTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const abortByItemIdRef = useRef<Map<string, AbortController>>(new Map());
  const lastSavedKeyRef = useRef<Map<string, string>>(new Map());
  // Key the item was last scheduled with. Guards against re-arming the timer on unrelated
  // `items` renders (e.g. editing B while A is still pending) — only a changed A target
  // reschedules A, a changed B target reschedules B.
  const scheduledKeyRef = useRef<Map<string, string>>(new Map());

  const flushSave = useCallback(
    (itemId: string, target: unknown, key: string) => {
      if (!queueId) return;
      const existingController = abortByItemIdRef.current.get(itemId);
      if (existingController) existingController.abort();
      const controller = new AbortController();
      abortByItemIdRef.current.set(itemId, controller);
      lastSavedKeyRef.current.set(itemId, key);
      (async () => {
        try {
          const res = await fetch(`/api/projects/${projectId}/queues/${queueId}/items/${itemId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ target, isLabelled: false }),
            signal: controller.signal,
          });
          if (!res.ok) throw new Error("save failed");
        } catch {
          if (!controller.signal.aborted) {
            // Clear the last-saved marker so a subsequent render can retry.
            lastSavedKeyRef.current.delete(itemId);
          }
        } finally {
          if (abortByItemIdRef.current.get(itemId) === controller) abortByItemIdRef.current.delete(itemId);
        }
      })();
    },
    [projectId, queueId]
  );

  // Re-scan dirty items on every render and (re)arm one timer per id WHEN the id's own
  // target content has changed since it was last scheduled. Ids whose target is unchanged
  // keep their existing timer untouched — so editing B doesn't defer A's pending save.
  useEffect(() => {
    if (!queueId) return;
    const timers = saveTimersRef.current;
    for (const id of dirtyItemIds) {
      const item = items.find((i) => i.id === id);
      if (!item) continue;
      const target = (item.payload as { target?: unknown }).target ?? null;
      const key = JSON.stringify({ id, target });
      if (lastSavedKeyRef.current.get(id) === key) continue;
      if (scheduledKeyRef.current.get(id) === key) continue;
      const existingTimer = timers.get(id);
      if (existingTimer) clearTimeout(existingTimer);
      scheduledKeyRef.current.set(id, key);
      const timer = setTimeout(() => {
        timers.delete(id);
        scheduledKeyRef.current.delete(id);
        flushSave(id, target, key);
      }, 600);
      timers.set(id, timer);
    }
  }, [items, dirtyItemIds, queueId, flushSave]);

  // On unmount, flush any pending-but-not-yet-fired saves so leaving the page doesn't
  // silently drop edits. Use refs for latest items/flushSave since this effect runs once.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const flushSaveRef = useRef(flushSave);
  flushSaveRef.current = flushSave;
  useEffect(() => {
    const timers = saveTimersRef.current;
    return () => {
      for (const [id, timer] of timers) {
        clearTimeout(timer);
        const item = itemsRef.current.find((i) => i.id === id);
        if (!item) continue;
        const target = (item.payload as { target?: unknown }).target ?? null;
        const key = JSON.stringify({ id, target });
        if (lastSavedKeyRef.current.get(id) === key) continue;
        flushSaveRef.current(id, target, key);
      }
      timers.clear();
    };
  }, []);

  // Cancel the timer and in-flight PATCH for one item, and pre-set lastSavedKey to the
  // target content we're about to send so the scheduler effect won't re-arm a fresh timer
  // on the next render.
  const cancelPendingSaveFor = useCallback((itemId: string, target: unknown) => {
    const timer = saveTimersRef.current.get(itemId);
    if (timer) {
      clearTimeout(timer);
      saveTimersRef.current.delete(itemId);
    }
    scheduledKeyRef.current.delete(itemId);
    const controller = abortByItemIdRef.current.get(itemId);
    if (controller) {
      controller.abort();
      abortByItemIdRef.current.delete(itemId);
    }
    lastSavedKeyRef.current.set(itemId, JSON.stringify({ id: itemId, target: target ?? null }));
  }, []);

  const approveCurrent = useCallback(async () => {
    if (!currentItem || !queueId || !isTargetJsonValid) return;
    // Re-entry guard: the button is disabled while any PATCH/DELETE is in flight, but
    // the meta+enter hotkey bypasses that. Without this, a held shortcut or rapid
    // double-tap can queue a second approve for the same item.
    if (ioState !== false && ioState !== "list") return;
    const target = (currentItem.payload as { target?: unknown }).target;
    // Cancel any in-flight debounced save and short-circuit a pending one — we're about to write
    // `isLabelled:true` and a stale `isLabelled:false` PATCH arriving after would revert it.
    cancelPendingSaveFor(currentItem.id, target);
    setIoState("save");
    try {
      const res = await fetch(`/api/projects/${projectId}/queues/${queueId}/items/${currentItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, isLabelled: true }),
      });
      if (!res.ok) {
        const errMessage = await res
          .json()
          .then((d) => d?.error)
          .catch(() => null);
        toast({ variant: "destructive", title: errMessage ?? "Failed to approve item" });
        return;
      }
      markLabelled(currentItem.id);
      if (currentIndex < items.length - 1) step(1);
    } catch {
      toast({ variant: "destructive", title: "Failed to approve item" });
    } finally {
      setIoState(false);
    }
  }, [
    currentItem,
    queueId,
    isTargetJsonValid,
    ioState,
    projectId,
    toast,
    markLabelled,
    currentIndex,
    items.length,
    step,
    setIoState,
    cancelPendingSaveFor,
  ]);

  const discardCurrent = useCallback(async () => {
    if (!currentItem || !queueId) return;
    // Re-entry guard — see approveCurrent. Meta+backspace would otherwise fire twice.
    if (ioState !== false && ioState !== "list") return;
    // Cancel any in-flight debounced save — a late PATCH would re-insert a row with a fresher
    // updated_at and resurrect this item past the delete tombstone.
    cancelPendingSaveFor(currentItem.id, (currentItem.payload as { target?: unknown }).target);
    setIoState("remove");
    try {
      const res = await fetch(`/api/projects/${projectId}/queues/${queueId}/items/${currentItem.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skip: true,
          data: get(currentItem.payload, "data", {}),
          target: get(currentItem.payload, "target", {}),
          metadata: get(currentItem.payload, "metadata", {}),
        }),
      });
      if (!res.ok) {
        const errMessage = await res
          .json()
          .then((d) => d?.error)
          .catch(() => null);
        toast({ variant: "destructive", title: errMessage ?? "Failed to discard item" });
        return;
      }
      removeItemLocal(currentItem.id);
      // Revalidate so `data.progress.total` — the authoritative server count used as the
      // progress-bar denominator — reflects the discard. Without this the bar stays stuck
      // at the pre-discard total until the next full refetch.
      mutate();
    } catch {
      toast({ variant: "destructive", title: "Failed to discard item" });
    } finally {
      setIoState(false);
    }
  }, [currentItem, queueId, ioState, projectId, toast, removeItemLocal, setIoState, cancelPendingSaveFor, mutate]);

  const pushAll = useCallback(async () => {
    if (!queueId) return;
    if (!dataset) {
      toast({ variant: "destructive", title: "Pick a dataset first" });
      return;
    }
    // Cancel pending debounced saves for every dirty item. pushItemsToDataset deletes
    // rows from CH, and a late save-fires `updateQueueItem` would FINAL-SELECT the
    // now-missing row, fall through to defaults, and re-insert a ghost (empty data,
    // fresh createdAt). Any dirty item might be labelled (hence pushed) or become
    // labelled before the server reads — cancel them all to be safe.
    for (const id of dirtyItemIds) {
      const item = items.find((i) => i.id === id);
      const target = item ? (item.payload as { target?: unknown }).target : undefined;
      cancelPendingSaveFor(id, target);
    }
    setIoState("push-all");
    try {
      const res = await fetch(`/api/projects/${projectId}/queues/${queueId}/push-to-dataset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ datasetId: dataset }),
      });
      if (!res.ok) {
        const errMessage = await res
          .json()
          .then((d) => d?.error)
          .catch(() => null);
        toast({ variant: "destructive", title: errMessage ?? "Failed to push approved items" });
        return;
      }
      const result = await res.json();
      toast({ title: `Pushed ${result.pushed ?? 0} items to dataset` });
      mutate();
    } catch {
      toast({ variant: "destructive", title: "Failed to push approved items" });
    } finally {
      setIoState(false);
    }
  }, [queueId, dataset, projectId, toast, setIoState, mutate, dirtyItemIds, items, cancelPendingSaveFor]);

  const pushCurrent = useCallback(async () => {
    if (!queueId || !currentItem) return;
    if (!dataset) {
      toast({ variant: "destructive", title: "Pick a dataset first" });
      return;
    }
    if (!currentItem.isLabelled) {
      toast({ variant: "destructive", title: "Approve the item before pushing" });
      return;
    }
    // Cancel any in-flight debounced save for this item — push deletes the row, and a
    // late PATCH would hit `updateQueueItem`'s FINAL SELECT, miss it, and fall through
    // to defaults, re-inserting a ghost row (same pattern as discardCurrent).
    cancelPendingSaveFor(currentItem.id, (currentItem.payload as { target?: unknown }).target);
    setIoState("push-one");
    try {
      const res = await fetch(`/api/projects/${projectId}/queues/${queueId}/push-to-dataset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ datasetId: dataset, itemIds: [currentItem.id] }),
      });
      if (!res.ok) {
        const errMessage = await res
          .json()
          .then((d) => d?.error)
          .catch(() => null);
        toast({ variant: "destructive", title: errMessage ?? "Failed to push item" });
        return;
      }
      const result = await res.json();
      if (!result?.pushed) {
        toast({ variant: "destructive", title: "Item was not pushed — approve it first" });
        return;
      }
      toast({ title: "Pushed item to dataset" });
      removeItemLocal(currentItem.id);
      // Revalidate so `data.progress.total` (the progress-bar denominator) reflects the
      // server-side row count after the queue item was deleted in push-to-dataset.
      mutate();
    } catch {
      toast({ variant: "destructive", title: "Failed to push item" });
    } finally {
      setIoState(false);
    }
  }, [queueId, currentItem, dataset, projectId, toast, setIoState, removeItemLocal, mutate, cancelPendingSaveFor]);

  useHotkeys(
    "meta+enter,ctrl+enter",
    (e: KeyboardEvent) => {
      e.preventDefault();
      approveCurrent();
    },
    { enableOnFormTags: true }
  );
  useHotkeys(
    "meta+backspace,ctrl+backspace",
    (e: KeyboardEvent) => {
      e.preventDefault();
      discardCurrent();
    },
    { enableOnFormTags: true }
  );
  useHotkeys(
    "meta+left,ctrl+left",
    (e: KeyboardEvent) => {
      e.preventDefault();
      step(-1);
    },
    { enableOnFormTags: true }
  );
  useHotkeys(
    "meta+right,ctrl+right",
    (e: KeyboardEvent) => {
      e.preventDefault();
      step(1);
    },
    { enableOnFormTags: true }
  );

  const onTargetJsonChange = useCallback(
    (v: string) => {
      try {
        const parsed = JSON.parse(v);
        setTargetJsonValid(true);
        setTarget(parsed);
      } catch {
        setTargetJsonValid(false);
      }
    },
    [setTarget, setTargetJsonValid]
  );

  // "list" covers SWR loading the full item list — navigation is fine because items are
  // already rendered from cache. Every other in-flight state (approve="save", discard,
  // push-one, push-all) must block approve/discard so a rapid double-click can't
  // double-PATCH the same item or spill the action into the one `step(1)` moved to next.
  const disableNav = ioState !== false && ioState !== "list";
  const canApprove = !!currentItem && isTargetJsonValid && !disableNav;
  const canDiscard = !!currentItem && !disableNav;

  if (isLoading && items.length === 0) {
    return (
      <>
        <Header path={`labeling queues/${queue?.name || "Queue"}`} />
        <div className="px-4 pb-4 flex flex-col flex-1 gap-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-full flex-1" />
        </div>
      </>
    );
  }

  if (items.length === 0) {
    return (
      <>
        <Header path={`labeling queues/${queue?.name || "Queue"}`} />
        <div className="px-4 pb-4 flex flex-col flex-1">
          <QueueToolbar
            progress={progress}
            progressPct={progressPct}
            dataset={dataset}
            onDatasetChange={setDataset}
            onPushAll={pushAll}
            onPushCurrent={pushCurrent}
            disablePushAll={progress.labelled === 0 || !dataset}
            disablePushCurrent
            ioState={ioState}
          />
          <div className="flex flex-col gap-1 justify-center items-center flex-1">
            <span className="text-lg">No items in this queue</span>
            <span className="text-secondary-foreground text-sm">
              Push items from a dataset or a span to start labelling
            </span>
          </div>
        </div>
      </>
    );
  }

  const pushedToDatasetId = get(currentItem?.metadata, "pushedToDatasetId") as string | undefined;
  const pushedBadgeActive = !!pushedToDatasetId && pushedToDatasetId === dataset;

  return (
    <>
      <Header path={`labeling queues/${queue?.name || "Queue"}`} />
      <div className="px-4 pb-4 flex flex-col flex-1 gap-3 overflow-hidden">
        <QueueToolbar
          progress={progress}
          progressPct={progressPct}
          dataset={dataset}
          onDatasetChange={setDataset}
          onPushAll={pushAll}
          onPushCurrent={pushCurrent}
          disablePushAll={progress.labelled === 0 || !dataset || disableNav}
          disablePushCurrent={!currentItem || !currentItem.isLabelled || !dataset || disableNav}
          ioState={ioState}
        />

        <div className="grid grid-cols-2 gap-3 flex-1 overflow-hidden">
          <div className="flex flex-col border rounded overflow-hidden">
            <div className="flex px-3 py-2 border-b items-center justify-between">
              <span className="text-sm font-medium">Data</span>
              <div className="flex items-center gap-2 text-xs text-secondary-foreground">
                {pushedBadgeActive && (
                  <span className="inline-flex items-center gap-1 text-primary">
                    <Check className="size-3" /> in dataset
                  </span>
                )}
                {sourceInfo ? (
                  <>
                    <span>from</span>
                    <Link className="inline-flex items-center text-primary hover:underline" href={sourceInfo.link}>
                      {sourceInfo.label}
                      <ArrowUpRight className="size-3 ml-0.5" />
                    </Link>
                  </>
                ) : (
                  <span>created manually</span>
                )}
              </div>
            </div>
            <div className="flex flex-1 overflow-hidden">
              <ContentRenderer
                presetKey={`labeling-queue-data-${queue?.id}`}
                className="rounded-none"
                codeEditorClassName="rounded-none"
                defaultMode="json"
                readOnly
                value={JSON.stringify(get(currentItem?.payload, "data", {}), null, 2)}
              />
            </div>
          </div>

          <div className="flex flex-col border rounded overflow-hidden bg-secondary">
            <div className="flex px-3 py-2 border-b items-center justify-between">
              <span className="text-sm font-medium">Target</span>
              <SchemaDefinitionDialog />
            </div>
            <div className="flex flex-1 flex-col overflow-hidden relative">
              {(ioState === "save" || ioState === "remove" || ioState === "push-one") && (
                <div className="z-30 absolute inset-0 bg-background/30 backdrop-blur-xs flex items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              )}
              <Tabs defaultValue={fields.length > 0 ? "form" : "data"} className="flex flex-1 flex-col gap-0 p-3">
                <TabsList className="self-start">
                  <TabsTrigger value="data">Data</TabsTrigger>
                  <TabsTrigger value="form" disabled={fields.length === 0}>
                    Form
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="data" className="flex flex-1 flex-col overflow-hidden pt-3">
                  <span className="text-xs text-secondary-foreground mb-2">
                    JSON written to the target key of the payload.
                  </span>
                  <div className="flex flex-1 overflow-hidden">
                    <ContentRenderer
                      presetKey={`labeling-queue-target-${queue?.id}`}
                      codeEditorClassName="rounded-none"
                      className={cn("rounded", !isTargetJsonValid && "border border-destructive/75")}
                      defaultMode="json"
                      value={JSON.stringify(get(currentItem?.payload, "target", {}), null, 2)}
                      onChange={onTargetJsonChange}
                    />
                  </div>
                </TabsContent>
                <TabsContent value="form" className="flex flex-1 flex-col overflow-auto pt-3">
                  {annotationSchema && fields.length > 0 ? (
                    <AnnotationInterface />
                  ) : (
                    <div className="text-xs text-secondary-foreground">
                      Define an annotation schema first to enable the form view.
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </div>

        <BottomControls
          currentIndex={currentIndex}
          total={items.length}
          onPrev={() => step(-1)}
          onNext={() => step(1)}
          onApprove={approveCurrent}
          onDiscard={discardCurrent}
          approveDisabled={!canApprove}
          discardDisabled={!canDiscard}
          ioState={ioState}
          setCurrentIndex={setCurrentIndex}
        />
      </div>
    </>
  );
}

function QueueToolbar({
  progress,
  progressPct,
  dataset,
  onDatasetChange,
  onPushAll,
  onPushCurrent,
  disablePushAll,
  disablePushCurrent,
  ioState,
}: {
  progress: { total: number; labelled: number };
  progressPct: number;
  dataset: string | undefined;
  onDatasetChange: (id: string | undefined) => void;
  onPushAll: () => void;
  onPushCurrent: () => void;
  disablePushAll: boolean;
  disablePushCurrent: boolean;
  ioState: string | false;
}) {
  const pushing = ioState === "push-all" || ioState === "push-one";
  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-1 items-center gap-3 border rounded px-3 py-2 min-w-0">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium">
            {progress.labelled}
            <span className="text-secondary-foreground"> / {progress.total}</span>
          </span>
          <span className="text-xs text-secondary-foreground">labelled</span>
        </div>
        <div className="flex-1 min-w-0">
          <Progress
            value={progressPct}
            className="h-2"
            indicatorClassName={cn(progressPct === 100 ? "bg-green-500" : "bg-primary")}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="w-56">
          <DatasetSelect value={dataset} onChange={(d) => onDatasetChange(d?.id)} />
        </div>
        <div className="inline-flex">
          <Button variant="default" className="rounded-r-none" onClick={onPushAll} disabled={disablePushAll || pushing}>
            {ioState === "push-all" ? <Loader2 className="size-3 animate-spin mr-1" /> : null}
            Push all approved
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="default" className="rounded-l-none border-l border-white/25 px-2" disabled={pushing}>
                <ChevronDown className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onPushAll} disabled={disablePushAll}>
                Push all approved
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onPushCurrent} disabled={disablePushCurrent}>
                Push this datapoint
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}

function BottomControls({
  currentIndex,
  total,
  onPrev,
  onNext,
  onApprove,
  onDiscard,
  approveDisabled,
  discardDisabled,
  ioState,
  setCurrentIndex,
}: {
  currentIndex: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onApprove: () => void;
  onDiscard: () => void;
  approveDisabled: boolean;
  discardDisabled: boolean;
  ioState: string | false;
  setCurrentIndex: (i: number) => void;
}) {
  return (
    <div className="flex items-center justify-center">
      <div className="inline-flex items-center gap-3 rounded border px-3 py-2">
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" onClick={onPrev} disabled={currentIndex <= 0} aria-label="previous">
                <ChevronLeft className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>⌘ + ←</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <span className="text-xs text-secondary-foreground px-1 tabular-nums">
          <input
            type="number"
            min={1}
            max={Math.max(total, 1)}
            value={Math.min(currentIndex + 1, Math.max(total, 1))}
            onChange={(e) => {
              const v = Number.parseInt(e.target.value, 10);
              if (Number.isFinite(v)) setCurrentIndex(v - 1);
            }}
            className="w-10 bg-transparent text-center outline-none"
          />
          of {total}
        </span>
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                onClick={onNext}
                disabled={currentIndex >= total - 1}
                aria-label="next"
              >
                <ChevronRight className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>⌘ + →</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <div className="h-5 w-px bg-border mx-1" />

        <Button onClick={onDiscard} disabled={discardDisabled} variant="destructiveOutline">
          {ioState === "remove" ? (
            <Loader2 className="size-3 animate-spin mr-1" />
          ) : (
            <Trash2 className="size-3.5 mr-1" />
          )}
          Discard
          <span className="ml-2 text-xs opacity-75">⌘ + ⌫</span>
        </Button>
        <Button onClick={onApprove} disabled={approveDisabled}>
          {ioState === "save" ? <Loader2 className="size-3 animate-spin mr-1" /> : <Check className="size-3.5 mr-1" />}
          Approve
          <span className="ml-2 text-xs opacity-75">⌘ + ⏎</span>
        </Button>
      </div>
    </div>
  );
}

export default function Queue({ queue }: { queue: LabelingQueue }) {
  return (
    <QueueStoreProvider queue={queue}>
      <QueueInner />
    </QueueStoreProvider>
  );
}
