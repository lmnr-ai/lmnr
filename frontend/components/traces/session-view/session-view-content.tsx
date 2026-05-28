"use client";

import React, { useEffect, useMemo } from "react";
import { shallow } from "zustand/shallow";

import { type TraceRow } from "@/lib/traces/types";

import FillWidthLayout, { type SessionViewPanels } from "./fill-width-layout";
import SessionPanel from "./session-panel";
import SessionSpanPanel from "./session-span-panel";
import { useSessionViewStore } from "./store";

const PAGE_SIZE = 200;

export default function SessionViewContent() {
  const { projectId, sessionId, spanPanelOpen, setTraces, setIsTracesLoading, setTracesError } = useSessionViewStore(
    (s) => ({
      projectId: s.projectId,
      sessionId: s.sessionId,
      spanPanelOpen: s.spanPanelOpen,
      setTraces: s.setTraces,
      setIsTracesLoading: s.setIsTracesLoading,
      setTracesError: s.setTracesError,
    }),
    shallow
  );

  useEffect(() => {
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
  }, [projectId, sessionId, setTraces, setIsTracesLoading, setTracesError]);

  const panels: SessionViewPanels = useMemo(
    () => ({
      sessionPanel: <SessionPanel />,
      spanPanel: <SessionSpanPanel />,
      showSpan: spanPanelOpen,
    }),
    [spanPanelOpen]
  );

  return <FillWidthLayout panels={panels} />;
}
