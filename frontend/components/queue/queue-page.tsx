"use client";

import { useParams } from "next/navigation";

import Header from "@/components/ui/header";

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
export default function QueuePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const queue = useQueueStore((s) => s.queue);
  const itemsLen = useQueueStore((s) => s.idsList.length);
  const isInitialLoaded = useQueueStore((s) => s.isInitialLoaded);

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
        <div className="grid grid-cols-2 gap-3 flex-1 overflow-hidden">
          <DataPanel />
          <TargetPanel />
        </div>
        <BottomControls />
        <QueueHotkeys />
      </div>
    </>
  );
}
