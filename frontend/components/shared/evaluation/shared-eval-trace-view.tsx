"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";

import { PureTraceView } from "@/components/shared/traces/trace-view";
import TraceViewStoreProvider, {
  type TraceViewSpan,
  type TraceViewTrace,
} from "@/components/traces/trace-view/trace-view-store.tsx";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface SharedEvalTraceViewProps {
  traceId: string;
  onClose: () => void;
}

function SharedEvalTraceViewContent({ traceId, onClose }: SharedEvalTraceViewProps) {
  const [trace, setTrace] = useState<TraceViewTrace | null>(null);
  const [spans, setSpans] = useState<TraceViewSpan[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      try {
        const [traceRes, spansRes] = await Promise.all([
          fetch(`/api/shared/traces/${traceId}`),
          fetch(`/api/shared/traces/${traceId}/spans`),
        ]);

        if (cancelled) return;

        if (!traceRes.ok || !spansRes.ok) {
          setError("Failed to load trace data");
          return;
        }

        const [traceData, spansData] = await Promise.all([traceRes.json(), spansRes.json()]);

        if (cancelled) return;

        setTrace(traceData);
        setSpans(spansData);
      } catch {
        if (!cancelled) {
          setError("Failed to load trace data");
        }
      }
    }

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [traceId]);

  if (error) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center border-b px-2 py-1.5">
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X size={16} />
          </Button>
        </div>
        <div className="flex items-center justify-center flex-1 text-sm text-muted-foreground">
          {error}
        </div>
      </div>
    );
  }

  if (!trace || !spans) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center border-b px-2 py-1.5">
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X size={16} />
          </Button>
        </div>
        <div className="flex flex-col gap-2 p-4">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      </div>
    );
  }

  return <PureTraceView trace={trace} spans={spans} onClose={onClose} />;
}

export default function SharedEvalTraceView(props: SharedEvalTraceViewProps) {
  return (
    <TraceViewStoreProvider storeKey="shared-eval-trace-view">
      <SharedEvalTraceViewContent {...props} />
    </TraceViewStoreProvider>
  );
}
