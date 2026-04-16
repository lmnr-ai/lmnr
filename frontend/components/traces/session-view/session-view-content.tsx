"use client";

import { useParams } from "next/navigation";
import React, { useEffect, useMemo } from "react";
import { shallow } from "zustand/shallow";

import { type TraceRow } from "@/lib/traces/types";

import DynamicWidthLayout, { type SessionViewPanels } from "./dynamic-width-layout";
import SessionPanel from "./session-panel";
import SessionSpanPanel from "./session-span-panel";
import { useSessionViewStore } from "./store";

interface SessionViewContentProps {
  sessionId: string;
  onClose: () => void;
  sidePanelRef?: React.RefObject<HTMLDivElement | null>;
}

const PAGE_SIZE = 200;

export default function SessionViewContent({ sessionId, onClose, sidePanelRef }: SessionViewContentProps) {
  const { projectId } = useParams<{ projectId: string }>();

  const { spanPanelOpen, setTraces, setIsTracesLoading, setTracesError, setSession, setProjectId } =
    useSessionViewStore(
      (s) => ({
        spanPanelOpen: s.spanPanelOpen,
        setTraces: s.setTraces,
        setIsTracesLoading: s.setIsTracesLoading,
        setTracesError: s.setTracesError,
        setSession: s.setSession,
        setProjectId: s.setProjectId,
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
