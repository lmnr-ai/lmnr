"use client";

import { useParams } from "next/navigation";
import React, { useEffect, useMemo, useRef } from "react";
import { shallow } from "zustand/shallow";

import { useToast } from "@/lib/hooks/use-toast";
import { type TraceRow } from "@/lib/traces/types";

import DynamicWidthLayout, { type SessionViewPanels } from "./dynamic-width-layout";
import SessionPanel from "./session-panel";
import SessionSpanPanel from "./session-span-panel";
import { useSessionViewStore } from "./store";

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
    selectedSpan,
    setTraces,
    setIsTracesLoading,
    setTracesError,
    setSession,
    setProjectId,
    setTraceExpanded,
    setSelectedSpan,
  } = useSessionViewStore(
    (s) => ({
      traces: s.traces,
      spanPanelOpen: s.spanPanelOpen,
      selectedSpan: s.selectedSpan,
      setTraces: s.setTraces,
      setIsTracesLoading: s.setIsTracesLoading,
      setTracesError: s.setTracesError,
      setSession: s.setSession,
      setProjectId: s.setProjectId,
      setTraceExpanded: s.setTraceExpanded,
      setSelectedSpan: s.setSelectedSpan,
    }),
    shallow
  );
  const { toast } = useToast();

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

  // --- URL-driven span selection ---
  //
  // Resolve a `?spanId=…` param against this session: fetch the span, verify
  // it belongs to this session, find the owning trace in our loaded page,
  // expand it (store action kicks off span fetch), then select it. One-shot
  // per spanId via `handledRef`; session-panel's scroll effect handles the
  // actual scroll once the flat-row index is findable.
  const handledSpanIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!spanId || !projectId || traces.length === 0 || selectedSpan) return;
    if (handledSpanIdRef.current === spanId) return;
    handledSpanIdRef.current = spanId;

    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/spans/${spanId}`, { signal: controller.signal });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          toast({ variant: "destructive", title: err.error ?? "Failed to look up span" });
          return;
        }
        const span = (await res.json()) as { traceId: string };

        if (!traces.some((t) => t.id === span.traceId)) {
          toast({ variant: "destructive", title: "Span's parent trace has not been loaded" });
          return;
        }

        setTraceExpanded(span.traceId, true);
        setSelectedSpan({ traceId: span.traceId, spanId });
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        toast({ variant: "destructive", title: "Failed to look up span" });
      }
    })();

    return () => controller.abort();
  }, [spanId, projectId, sessionId, traces, selectedSpan, setTraceExpanded, setSelectedSpan, toast]);

  const panels: SessionViewPanels = useMemo(
    () => ({
      sessionPanel: <SessionPanel onClose={onClose} />,
      spanPanel: <SessionSpanPanel />,
      showSpan: spanPanelOpen,
    }),
    [onClose, spanPanelOpen]
  );

  return <DynamicWidthLayout panels={panels} sidePanelRef={sidePanelRef} />;
}
