"use client";

import { useParams } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { shallow } from "zustand/shallow";

import { type TraceViewSpan } from "@/components/traces/trace-view/store/base";
import { onRealtimeUpdateSpans } from "@/components/traces/trace-view/utils";
import { useRealtime } from "@/lib/hooks/use-realtime";
import { type TraceRow } from "@/lib/traces/types";

import DynamicWidthLayout, { type SessionViewPanels } from "./dynamic-width-layout";
import SessionChatPanel from "./session-chat-panel";
import SessionPanel from "./session-panel";
import SessionSpanPanel from "./session-span-panel";
import { useSessionViewStore, useSessionViewStoreRaw } from "./store";

interface SessionViewContentProps {
  sessionId: string;
  spanId?: string;
  onClose: () => void;
  sidePanelRef?: React.RefObject<HTMLDivElement | null>;
}

const PAGE_SIZE = 200;

export default function SessionViewContent({ sessionId, spanId, onClose, sidePanelRef }: SessionViewContentProps) {
  const { projectId } = useParams<{ projectId: string }>();

  const {
    traces,
    spanPanelOpen,
    chatOpen,
    setTraces,
    setIsTracesLoading,
    setTracesError,
    setTraceExpanded,
    setSession,
    setProjectId,
    setSelectedSpan,
  } = useSessionViewStore(
    (s) => ({
      traces: s.traces,
      spanPanelOpen: s.spanPanelOpen,
      chatOpen: s.chatOpen,
      setTraces: s.setTraces,
      setIsTracesLoading: s.setIsTracesLoading,
      setTracesError: s.setTracesError,
      setTraceExpanded: s.setTraceExpanded,
      setSession: s.setSession,
      setProjectId: s.setProjectId,
      setSelectedSpan: s.setSelectedSpan,
    }),
    shallow
  );

  // Push projectId into the store so store-owned async actions
  // (e.g. ensureTraceSpans) can issue requests without prop-drilling.
  useEffect(() => {
    setProjectId(projectId);
  }, [projectId, setProjectId]);

  // --- Fetch traces for the session ---
  useEffect(() => {
    setSession({ sessionId });
    const controller = new AbortController();
    const fetchTraces = async () => {
      try {
        setIsTracesLoading(true);
        setTracesError(undefined);

        const params = new URLSearchParams();
        params.set("pageNumber", "0");
        params.set("pageSize", String(PAGE_SIZE));
        params.set("filter", JSON.stringify({ column: "session_id", value: sessionId, operator: "eq" }));
        params.set("sortDirection", "ASC");

        const res = await fetch(`/api/projects/${projectId}/traces?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({ error: "Unknown error" }))) as { error?: string };
          setTracesError(err.error || "Failed to load session traces");
          return;
        }
        const body = (await res.json()) as { items: TraceRow[] };
        setTraces(body.items);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setTracesError(e instanceof Error ? e.message : "Failed to load session traces");
      } finally {
        setIsTracesLoading(false);
      }
    };
    fetchTraces();
    return () => controller.abort();
  }, [projectId, sessionId, setTraces, setIsTracesLoading, setTracesError, setSession]);

  // --- Auto-expand traces so URL-driven spanId can be found ---
  const urlSpanHandledRef = useRef<string | null>(null);
  useEffect(() => {
    if (!spanId || urlSpanHandledRef.current === spanId || traces.length === 0) return;
    // TODO(session-view): prefer a backend "which-trace-owns-span" lookup over
    // brute-force expanding all traces.
    for (const t of traces) setTraceExpanded(t.id, true);
    urlSpanHandledRef.current = spanId;
  }, [spanId, traces, setTraceExpanded]);

  const panels: SessionViewPanels = useMemo(
    () => ({
      sessionPanel: <SessionPanel onClose={onClose} />,
      spanPanel: <SessionSpanPanel />,
      chatPanel: <SessionChatPanel />,
      showSpan: spanPanelOpen,
      showChat: chatOpen,
    }),
    [onClose, spanPanelOpen, chatOpen]
  );

  return (
    <>
      {/* Fetches are now triggered inside TraceHeaderItem as traces scroll into
          view. Realtime stays subscription-per-trace. */}
      <UrlSpanResolver spanId={spanId} onResolve={setSelectedSpan} />
      {traces.map((t) => (
        <PerTraceRealtime key={t.id} projectId={projectId} traceId={t.id} />
      ))}

      <DynamicWidthLayout panels={panels} sidePanelRef={sidePanelRef} />
    </>
  );
}

/** Resolves the URL-provided spanId against loaded traceSpans and selects it. */
function UrlSpanResolver({
  spanId,
  onResolve,
}: {
  spanId?: string;
  onResolve: (selection?: { traceId: string; spanId: string }) => void;
}) {
  const { traceSpans, selectedSpan } = useSessionViewStore(
    (s) => ({ traceSpans: s.traceSpans, selectedSpan: s.selectedSpan }),
    shallow
  );

  useEffect(() => {
    if (!spanId || selectedSpan) return;
    for (const [traceId, spans] of Object.entries(traceSpans)) {
      const match = spans.find((s) => s.spanId === spanId);
      if (match) {
        onResolve({ traceId, spanId });
        break;
      }
    }
  }, [spanId, traceSpans, selectedSpan, onResolve]);

  return null;
}

/** One SSE subscription per trace in the session. */
function PerTraceRealtime({ projectId, traceId }: { projectId: string; traceId: string }) {
  const store = useSessionViewStoreRaw();

  // Stable callbacks that reach into the raw store — avoids re-subscribing on
  // every store mutation.
  const setSpansForTrace = useCallback(
    (updater: TraceViewSpan[] | ((prev: TraceViewSpan[]) => TraceViewSpan[])) => {
      const current = store.getState().traceSpans[traceId] ?? [];
      const next = typeof updater === "function" ? updater(current) : updater;
      store.getState().setTraceSpans(traceId, next);
    },
    [store, traceId]
  );

  const eventHandlers = useMemo(
    () => ({
      span_update: (event: MessageEvent) => {
        const payload = JSON.parse(event.data);
        if (!payload.spans || !Array.isArray(payload.spans)) return;
        const apply = onRealtimeUpdateSpans(
          setSpansForTrace,
          () => {},
          () => {}
        );
        for (const span of payload.spans) apply(span);
      },
    }),
    [setSpansForTrace]
  );

  useRealtime({
    key: `trace_${traceId}`,
    projectId,
    enabled: !!traceId && !!projectId,
    eventHandlers,
  });

  return null;
}
