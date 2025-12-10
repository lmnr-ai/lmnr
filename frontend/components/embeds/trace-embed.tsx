"use client";

import React, { useEffect, useMemo, useState } from "react";

import TraceView from "@/components/shared/traces/trace-view";
import { TraceViewSpan, TraceViewTrace } from "@/components/traces/trace-view/trace-view-store";

type TraceEmbedProps = {
  id?: string;
  traceId?: string;
  spanId?: string;
  host?: string;
  previewOnly?: boolean;
  height?: number;
};

type TracePayload = {
  trace: TraceViewTrace;
  spans: TraceViewSpan[];
};

const TraceEmbed = ({ id, traceId, spanId, host, previewOnly = false, height = 720 }: TraceEmbedProps) => {
  const traceIdentifier = traceId || id;
  const resolvedHost = useMemo(() => {
    const fallback = process.env.NEXT_PUBLIC_APP_URL || "https://laminar.sh";
    const detected = typeof window !== "undefined" ? window.location.origin : "";
    const base = host || detected || fallback;
    return base.endsWith("/") ? base.slice(0, -1) : base;
  }, [host]);

  const [data, setData] = useState<TracePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(Boolean(traceIdentifier) && !previewOnly);

  useEffect(() => {
    if (!traceIdentifier || previewOnly) {
      return;
    }

    const controller = new AbortController();
    const load = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const [traceRes, spansRes] = await Promise.all([
          fetch(`${resolvedHost}/api/shared/traces/${traceIdentifier}`, { signal: controller.signal }),
          fetch(`${resolvedHost}/api/shared/traces/${traceIdentifier}/spans`, { signal: controller.signal }),
        ]);

        if (!traceRes.ok) {
          const text = await traceRes.text();
          throw new Error(text || "Failed to load trace.");
        }

        if (!spansRes.ok) {
          const text = await spansRes.text();
          throw new Error(text || "Failed to load spans.");
        }

        const [trace, spans] = await Promise.all([traceRes.json(), spansRes.json()]);
        setData({ trace, spans });
      } catch (e) {
        if (controller.signal.aborted) return;
        setData(null);
        setError(e instanceof Error ? e.message : "Failed to load shared trace.");
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => controller.abort();
  }, [previewOnly, resolvedHost, traceIdentifier]);

  const showPlaceholder = previewOnly || !traceIdentifier;

  return (
    <div
      className="w-full border border-white/10 bg-secondary/20 rounded-xl overflow-hidden"
      style={{ minHeight: height, height }}
    >
      {showPlaceholder && (
        <div className="p-4 text-sm text-muted-foreground">
          Preview your trace embed here. Once the trace is public and IDs are provided, the full trace view will render.
        </div>
      )}
      {!showPlaceholder && isLoading && (
        <div className="p-4 text-sm text-muted-foreground">Loading shared trace&hellip;</div>
      )}
      {!showPlaceholder && error && (
        <div className="p-4 text-sm text-destructive bg-destructive/10 border-b border-destructive/40">{error}</div>
      )}
      {!showPlaceholder && data && (
        <div className="h-full min-h-[640px] bg-background" style={{ height: "100%" }}>
          <TraceView trace={data.trace} spans={data.spans} initialSpanId={spanId} disableRouting />
        </div>
      )}
    </div>
  );
};

export default TraceEmbed;
