"use client";

import { get } from "lodash";
import { ArrowUpRight, Check } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import ContentRenderer from "@/components/ui/content-renderer/index";

import { useQueueStore } from "./queue-store";

interface SourceInfo {
  label: string;
  link: string;
}

const buildSourceInfo = (metadata: Record<string, unknown> | undefined, projectId: string): SourceInfo | null => {
  if (!metadata) return null;
  const source = get(metadata, "source");
  if (source === "datapoint") {
    return {
      label: "datapoint",
      link: `/project/${projectId}/datasets/${get(metadata, "datasetId")}?datapointId=${get(metadata, "id")}`,
    };
  }
  if (source === "span") {
    return {
      label: "span",
      link: `/project/${projectId}/traces?traceId=${get(metadata, "traceId")}&spanId=${get(metadata, "id")}`,
    };
  }
  if (source === "sql") {
    return { label: "sql", link: `/project/${projectId}/sql/${get(metadata, "id")}` };
  }
  return null;
};

export default function DataPanel() {
  const projectId = useQueueStore((s) => s.projectId);
  const queueId = useQueueStore((s) => s.queue.id);
  const currentItem = useQueueStore((s) => s.getCurrentItem());
  const dataset = useQueueStore((s) => s.dataset);

  const sourceInfo = useMemo(() => {
    if (!currentItem) return null;
    return buildSourceInfo(currentItem.metadata as Record<string, unknown>, projectId);
  }, [currentItem, projectId]);

  const pushedToDatasetId = get(currentItem?.metadata, "pushedToDatasetId") as string | undefined;
  const pushedBadgeActive = !!pushedToDatasetId && pushedToDatasetId === dataset;

  const dataValue = useMemo(
    () => JSON.stringify(get(currentItem?.payload, "data", {}), null, 2),
    [currentItem?.payload]
  );

  return (
    <div className="flex flex-col border rounded-lg overflow-hidden">
      <div className="flex px-3 py-2 border-b bg-secondary items-center justify-between">
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
          presetKey={`labeling-queue-data-${queueId}`}
          className="rounded-none border-0"
          codeEditorClassName="rounded-none"
          defaultMode="json"
          readOnly
          value={dataValue}
        />
      </div>
    </div>
  );
}
