"use client";

import { ArrowRight, CircleDollarSign, Clock3, Coins, X } from "lucide-react";
import { useParams } from "next/navigation";
import useSWR from "swr";

import { ModelIndicator } from "@/components/traces/model-indicator";
import SpanTypeIcon from "@/components/traces/span-type-icon";
import { SpanView } from "@/components/traces/span-view";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type Span } from "@/lib/traces/types";
import { getDurationString } from "@/lib/utils";

import DiffTextView from "./diff-text-view";
import { useTraceDiffStore } from "./trace-diff-store";

const swrFetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch span");
  return res.json();
};

/**
 * Recursively expand JSON strings nested within a value.
 * Walks the structure and for every string that is valid JSON,
 * parses it and recurses deeper — until no more strings are parsable.
 * The result is a fully expanded object with no JSON-string blobs.
 */
function deepParseJson(value: unknown): unknown {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      // Only expand if it parsed into a non-primitive (object/array)
      // to avoid turning the string "42" into the number 42.
      if (typeof parsed === "object" && parsed !== null) {
        return deepParseJson(parsed);
      }
      return parsed;
    } catch {
      return value;
    }
  }
  if (Array.isArray(value)) {
    return value.map(deepParseJson);
  }
  if (typeof value === "object" && value !== null) {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = deepParseJson(v);
    }
    return result;
  }
  return value;
}

function prettyPrint(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return JSON.stringify(deepParseJson(parsed), null, 2);
    } catch {
      return value;
    }
  }
  return JSON.stringify(deepParseJson(value), null, 2);
}

const compactNumberFormat = new Intl.NumberFormat("en-US", { notation: "compact" });

function ComparisonStat({
  icon,
  leftValue,
  rightValue,
}: {
  icon: React.ReactNode;
  leftValue: string;
  rightValue: string;
}) {
  return (
    <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-muted text-xs font-mono">
      {icon}
      <Label className="text-xs text-white">{leftValue}</Label>
      <ArrowRight className="size-3 text-secondary-foreground" />
      <Label className="text-xs text-white">{rightValue}</Label>
    </div>
  );
}

function MatchedSpanDiff({
  leftTraceId,
  leftSpanId,
  rightTraceId,
  rightSpanId,
  onClose,
}: {
  leftTraceId: string;
  leftSpanId: string;
  rightTraceId: string;
  rightSpanId: string;
  onClose: () => void;
}) {
  const { projectId } = useParams<{ projectId: string }>();

  const { data: leftSpan, isLoading: leftLoading } = useSWR<Span>(
    `/api/projects/${projectId}/traces/${leftTraceId}/spans/${leftSpanId}`,
    swrFetcher
  );

  const { data: rightSpan, isLoading: rightLoading } = useSWR<Span>(
    `/api/projects/${projectId}/traces/${rightTraceId}/spans/${rightSpanId}`,
    swrFetcher
  );

  const isLoading = leftLoading || rightLoading;

  if (isLoading) {
    return (
      <div className="flex flex-col space-y-2 p-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (!leftSpan || !rightSpan) {
    return <div className="p-3 text-sm text-muted-foreground">Failed to load span data</div>;
  }

  return (
    <>
      {/* Header section matching SpanControls layout */}
      <div className="flex flex-col px-2 pt-2 gap-2 flex-shrink-0">
        <div className="flex flex-none items-center space-x-2">
          <SpanTypeIcon spanType={leftSpan.spanType} />
          <span className="text-base font-medium truncate flex-1">{leftSpan.name}</span>
          <Button variant="ghost" size="icon" className="size-6 flex-shrink-0" onClick={onClose}>
            <X className="size-3.5" />
          </Button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ComparisonStat
            icon={<Clock3 size={12} className="min-w-3" />}
            leftValue={getDurationString(leftSpan.startTime, leftSpan.endTime)}
            rightValue={getDurationString(rightSpan.startTime, rightSpan.endTime)}
          />
          <ComparisonStat
            icon={<Coins size={12} className="min-w-3" />}
            leftValue={compactNumberFormat.format(leftSpan.totalTokens)}
            rightValue={compactNumberFormat.format(rightSpan.totalTokens)}
          />
          <ComparisonStat
            icon={<CircleDollarSign size={12} className="min-w-3" />}
            leftValue={`$${leftSpan.totalCost?.toFixed(2)}`}
            rightValue={`$${rightSpan.totalCost?.toFixed(2)}`}
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ModelIndicator attributes={leftSpan.attributes} />
        </div>
      </div>

      {/* Tabs matching SpanView layout */}
      <Tabs className="flex flex-col grow overflow-hidden gap-0" defaultValue="span-input">
        <div className="px-2 pb-2 mt-2 border-b w-full">
          <TabsList className="border-none text-xs h-7">
            <TabsTrigger value="span-input" className="text-xs">
              Span Input
            </TabsTrigger>
            <TabsTrigger value="span-output" className="text-xs">
              Span Output
            </TabsTrigger>
            <TabsTrigger value="attributes" className="text-xs">
              Attributes
            </TabsTrigger>
            <TabsTrigger value="events" className="text-xs">
              Events
            </TabsTrigger>
          </TabsList>
        </div>
        <div className="grow flex overflow-hidden">
          <TabsContent value="span-input" className="w-full h-full">
            <DiffTextView leftText={prettyPrint(leftSpan.input)} rightText={prettyPrint(rightSpan.input)} />
          </TabsContent>
          <TabsContent value="span-output" className="w-full h-full">
            <DiffTextView leftText={prettyPrint(leftSpan.output)} rightText={prettyPrint(rightSpan.output)} />
          </TabsContent>
          <TabsContent value="attributes" className="w-full h-full">
            <DiffTextView
              leftText={JSON.stringify(leftSpan.attributes, null, 2)}
              rightText={JSON.stringify(rightSpan.attributes, null, 2)}
            />
          </TabsContent>
          <TabsContent value="events" className="w-full h-full">
            <DiffTextView
              leftText={JSON.stringify(leftSpan.events, null, 2)}
              rightText={JSON.stringify(rightSpan.events, null, 2)}
            />
          </TabsContent>
        </div>
      </Tabs>
    </>
  );
}

export default function DiffSpanPanel() {
  const { selectedRowIndex, alignedRows, clearSelection, leftTrace, rightTrace } = useTraceDiffStore((s) => ({
    selectedRowIndex: s.selectedRowIndex,
    alignedRows: s.alignedRows,
    clearSelection: s.clearSelection,
    leftTrace: s.leftTrace,
    rightTrace: s.rightTrace,
  }));

  if (selectedRowIndex === null) return null;

  const row = alignedRows[selectedRowIndex];
  if (!row) return null;

  // Matched: show comparison view
  if (row.type === "matched") {
    return (
      <div className="flex flex-col h-full w-full overflow-hidden">
        {leftTrace && rightTrace && (
          <MatchedSpanDiff
            leftTraceId={leftTrace.id}
            leftSpanId={row.left.spanId}
            rightTraceId={rightTrace.id}
            rightSpanId={row.right.spanId}
            onClose={clearSelection}
          />
        )}
      </div>
    );
  }

  // Unmatched: show regular SpanView (no extra header — SpanView has its own)
  const span = row.type === "left-only" ? row.left : row.right;
  const traceId = row.type === "left-only" ? leftTrace?.id : rightTrace?.id;

  if (!traceId) return null;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <SpanView spanId={span.spanId} traceId={traceId} />
    </div>
  );
}
