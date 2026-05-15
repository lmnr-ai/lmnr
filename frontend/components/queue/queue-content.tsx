"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { useDefaultLayout } from "react-resizable-panels";

import Header from "@/components/ui/header";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { track } from "@/lib/posthog";

import BottomControls from "./bottom-controls";
import DataPanel from "./data-panel";
import EmptyState from "./empty-state";
import QueueHotkeys from "./hotkeys";
import LoadingState from "./loading-state";
import { useQueueStore } from "./queue-store";
import TargetPanel from "./target-panel";
import Toolbar from "./toolbar";

const emptySubscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

/**
 * Top-level layout for a single labeling queue. Pure consumer of the store —
 * data fetching is orchestrated by `QueueDataLoader` and side effects live on
 * store actions, so this file is just composition.
 */
export default function QueueContent() {
  const queue = useQueueStore((s) => s.queue);
  const itemsLen = useQueueStore((s) => s.idsList.length);
  const isInitialLoaded = useQueueStore((s) => s.isInitialLoaded);

  const isClient = useSyncExternalStore(emptySubscribe, getClientSnapshot, getServerSnapshot);

  const trackedQueueIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isInitialLoaded) return;
    if (trackedQueueIdRef.current === queue.id) return;
    trackedQueueIdRef.current = queue.id;
    track("labeling_queues", "queue_page_viewed", { queueId: queue.id, itemsCount: itemsLen });
    // hydrateIndex flips isInitialLoaded and sets idsList atomically, so itemsLen
    // is already correct on the run that fires this. Re-running on every item
    // removal would just be wasted no-ops past the ref guard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInitialLoaded, queue.id]);

  if (!isInitialLoaded || !isClient) {
    return <LoadingState name={queue.name} />;
  }

  if (itemsLen === 0) {
    return <EmptyState />;
  }

  return <QueueContentInner />;
}

function QueueContentInner() {
  const { projectId } = useParams<{ projectId: string }>();
  const queue = useQueueStore((s) => s.queue);

  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: `queue-layout-${queue.id}`,
  });

  return (
    <>
      <Header
        path={[
          { name: "labeling queues", href: `/project/${projectId}/labeling-queues` },
          { name: queue.name, copyValue: queue.id },
        ]}
      />
      <div className="px-4 pb-4 flex flex-col flex-1 gap-3 overflow-hidden">
        <Toolbar />
        <ResizablePanelGroup
          defaultLayout={defaultLayout}
          onLayoutChanged={onLayoutChanged}
          orientation="horizontal"
          className="flex-1 overflow-hidden"
        >
          <ResizablePanel defaultSize={50} minSize="30%">
            <DataPanel />
          </ResizablePanel>
          <ResizableHandle withHandle className="z-30 bg-transparent ml-3.5" />
          <ResizablePanel defaultSize={50} minSize="30%">
            <TargetPanel />
          </ResizablePanel>
        </ResizablePanelGroup>
        <BottomControls />
        <QueueHotkeys />
      </div>
    </>
  );
}
