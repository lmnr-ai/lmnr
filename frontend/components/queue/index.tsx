"use client";

import { useParams } from "next/navigation";

import { type LabelingQueue } from "@/lib/queue/types";

import QueueContent from "./queue-content";
import QueueDataLoader from "./queue-data-loader";
import { QueueStoreProvider } from "./queue-store";

/**
 * Public entry point for the labeling queue UI.
 *
 * Layering:
 *   <QueueStoreProvider>     - owns all UI state + side-effecting actions
 *     <QueueDataLoader />    - SWR fetch hydrates the store, returns null
 *     <QueueContent />       - pure consumer of the store
 *   </QueueStoreProvider>
 *
 * No props are threaded through children — every child reads from the store.
 */
export default function Queue({ queue }: { queue: LabelingQueue }) {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  return (
    <QueueStoreProvider queue={queue} projectId={projectId}>
      <QueueDataLoader />
      <QueueContent />
    </QueueStoreProvider>
  );
}
