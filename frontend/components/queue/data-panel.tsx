"use client";

import { get } from "lodash";
import { Code2, Database, ExternalLink, type LucideIcon, Workflow } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import ContentRenderer from "@/components/ui/content-renderer/index";
import { cn } from "@/lib/utils";

import { useQueueStore } from "./queue-store";

interface SourceMeta {
  label: string;
  icon: LucideIcon;
  link?: string;
  /** Optional hover-tooltip (typically the underlying span/datapoint/template id). */
  hoverTitle?: string;
}

/**
 * Map the queue item's free-form `metadata` blob to a display-ready source
 * descriptor. `link` is only populated when the metadata has enough fields to
 * form a valid URL — partial metadata renders as a plain (non-link) pill so we
 * never produce `/sql/undefined`-style dead links.
 */
const buildSourceMeta = (metadata: Record<string, unknown> | undefined, projectId: string): SourceMeta | null => {
  if (!metadata) return null;
  const source = get(metadata, "source");
  const id = get(metadata, "id") as string | undefined;
  const datasetId = get(metadata, "datasetId") as string | undefined;
  const traceId = get(metadata, "traceId") as string | undefined;

  if (source === "span") {
    return {
      label: "span",
      icon: Workflow,
      link: traceId && id ? `/project/${projectId}/traces?traceId=${traceId}&spanId=${id}` : undefined,
      hoverTitle: id ? `span ${id}` : undefined,
    };
  }
  if (source === "datapoint") {
    return {
      label: "datapoint",
      icon: Database,
      link: datasetId && id ? `/project/${projectId}/datasets/${datasetId}?datapointId=${id}` : undefined,
      hoverTitle: id ? `datapoint ${id}` : undefined,
    };
  }
  if (source === "sql") {
    return {
      label: "SQL query",
      icon: Code2,
      link: id ? `/project/${projectId}/sql/${id}` : undefined,
      hoverTitle: id ? `SQL template ${id}` : "SQL editor export",
    };
  }
  return null;
};

function SourceBadge({ meta }: { meta: SourceMeta }) {
  const Icon = meta.icon;

  const content = (
    <span
      title={meta.hoverTitle}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs text-secondary-foreground",
        meta.link && "hover:bg-muted hover:text-foreground transition-colors"
      )}
    >
      <Icon className="size-3 shrink-0" />
      <span>
        From <span className="font-medium">{meta.label}</span>
      </span>
      {meta.link && <ExternalLink className="size-3 opacity-60 shrink-0" />}
    </span>
  );

  return meta.link ? <Link href={meta.link}>{content}</Link> : content;
}

export default function DataPanel() {
  const projectId = useQueueStore((s) => s.projectId);
  const queueId = useQueueStore((s) => s.queue.id);
  const currentItem = useQueueStore((s) => s.getCurrentItem());

  const sourceMeta = useMemo(() => {
    if (!currentItem) return null;
    return buildSourceMeta(currentItem.metadata as Record<string, unknown>, projectId);
  }, [currentItem, projectId]);

  const dataValue = useMemo(
    () => JSON.stringify(get(currentItem?.payload, "data", {}), null, 2),
    [currentItem?.payload]
  );

  return (
    <div className="flex flex-col h-full border rounded-lg overflow-hidden">
      <div className="flex min-h-[39px] p-2 border-b bg-secondary items-center justify-between gap-2">
        <span className="text-sm font-medium">Data</span>
        {sourceMeta && <SourceBadge meta={sourceMeta} />}
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
