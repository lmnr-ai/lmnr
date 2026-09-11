"use client";

import { ChevronDown, Copy, Database, ListPlus, Loader, PlayCircle } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";

import AddToLabelingQueueDialog from "@/components/traces/add-to-labeling-queue-dialog";
import ExportSpansDialog from "@/components/traces/export-spans-dialog";
import { useOpenInSql } from "@/components/traces/trace-view/use-open-in-sql";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/lib/hooks/use-toast";
import { track } from "@/lib/posthog";
import { type Span, SpanType } from "@/lib/traces/types";

interface SpanActionsDropdownProps {
  projectId: string;
  span: Span;
}

export default function SpanActionsDropdown({ projectId, span }: SpanActionsDropdownProps) {
  const { toast } = useToast();
  const { openInSql, isLoading } = useOpenInSql({
    projectId,
    params: { type: "span", spanId: span.spanId, traceId: span.traceId },
  });
  const [queueOpen, setQueueOpen] = useState(false);
  const [datasetOpen, setDatasetOpen] = useState(false);
  const skipMenuFocusRestore = useRef(false);

  const handleCopySpanId = async () => {
    await navigator.clipboard.writeText(span.spanId);
    toast({ title: "Copied span ID", duration: 1000 });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            aria-label="Span actions"
            className="min-w-0 justify-start gap-1 px-1 text-base font-medium hover:bg-surface-up"
          >
            <span className="truncate">{span.name}</span>
            <ChevronDown className="size-3.5 shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          onCloseAutoFocus={(event) => {
            if (skipMenuFocusRestore.current) {
              event.preventDefault();
              skipMenuFocusRestore.current = false;
            }
          }}
        >
          <DropdownMenuItem onClick={handleCopySpanId}>
            <Copy className="size-3.5" />
            Copy span ID
          </DropdownMenuItem>
          <DropdownMenuItem disabled={isLoading} onClick={openInSql}>
            {isLoading ? <Loader className="size-3.5 animate-spin" /> : <Database className="size-3.5" />}
            Open in SQL editor
          </DropdownMenuItem>
          {span.spanType === SpanType.LLM && (
            <DropdownMenuItem asChild>
              <Link
                href={{ pathname: `/project/${projectId}/playgrounds/create`, query: { spanId: span.spanId } }}
                onClick={() => track("playgrounds", "experiment_clicked", { source: "span_view" })}
              >
                <PlayCircle className="size-3.5" />
                Experiment in playground
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onSelect={() => {
              skipMenuFocusRestore.current = true;
              setDatasetOpen(false);
              setQueueOpen(true);
            }}
          >
            <ListPlus className="size-3.5" />
            Add to labeling queue
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              skipMenuFocusRestore.current = true;
              setQueueOpen(false);
              setDatasetOpen(true);
            }}
          >
            <Database className="size-3.5" />
            Add to dataset
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AddToLabelingQueueDialog
        spanId={span.spanId}
        traceId={span.traceId}
        open={queueOpen}
        onOpenChange={setQueueOpen}
      />
      <ExportSpansDialog span={span} open={datasetOpen} onOpenChange={setDatasetOpen} />
    </>
  );
}
