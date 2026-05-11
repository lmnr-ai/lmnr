"use client";

import { useParams } from "next/navigation";
import { useDefaultLayout } from "react-resizable-panels";

import Header from "@/components/ui/header";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";

import BottomControls from "./bottom-controls";
import DataPanel from "./data-panel";
import EmptyState from "./empty-state";
import QueueHotkeys from "./hotkeys";
import LoadingState from "./loading-state";
import { useQueueStore } from "./queue-store";
import TargetPanel from "./target-panel";
import Toolbar from "./toolbar";

/**
 * Top-level layout for a single labeling queue. Pure consumer of the store —
 * data fetching is orchestrated by `QueueDataLoader` and side effects live on
 * store actions, so this file is just composition.
 */
export default function QueueContent() {
  const { projectId } = useParams<{ projectId: string }>();
  const queue = useQueueStore((s) => s.queue);
  const itemsLen = useQueueStore((s) => s.idsList.length);
  const isInitialLoaded = useQueueStore((s) => s.isInitialLoaded);

  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: `queue-layout-${queue.id}`,
    storage: localStorage,
  });

  if (!isInitialLoaded) {
    return <LoadingState name={queue.name} />;
  }

  if (itemsLen === 0) {
    return <EmptyState />;
  }

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
          <ResizableHandle withHandle className="z-30 bg-transparent ml-[14px]" />
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
