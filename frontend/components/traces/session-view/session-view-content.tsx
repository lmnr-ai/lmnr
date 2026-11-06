"use client";

import { useParams } from "next/navigation";
import React, { useEffect, useMemo } from "react";
import { shallow } from "zustand/shallow";

import { fetchSessionTraces } from "@/components/traces/chat-session-view/session-api";

import FillWidthLayout, { type SessionViewPanels } from "./fill-width-layout";
import SessionPanel from "./session-panel";
import RegularSearchSlot from "./session-panel/regular-search-slot";
import RegularTimelineToggle from "./session-panel/regular-timeline-toggle";
import SessionTimeline from "./session-timeline";
import { useSessionViewStore } from "./store";

interface SessionViewContentProps {
  sessionId: string;
}

export default function SessionViewContent({ sessionId }: SessionViewContentProps) {
  const { projectId } = useParams<{ projectId: string }>();

  const {
    sessionTimelineEnabled,
    selectedSpan,
    setSelectedSpan,
    setTraces,
    setIsTracesLoading,
    setTracesError,
    setSession,
    setProjectId,
  } = useSessionViewStore(
    (s) => ({
      sessionTimelineEnabled: s.sessionTimelineEnabled,
      selectedSpan: s.selectedSpan,
      setSelectedSpan: s.setSelectedSpan,
      setTraces: s.setTraces,
      setIsTracesLoading: s.setIsTracesLoading,
      setTracesError: s.setTracesError,
      setSession: s.setSession,
      setProjectId: s.setProjectId,
    }),
    shallow
  );

  // Push projectId into the store so store-owned async actions
  // (e.g. fetchTraceSpans) can issue requests without prop-drilling.
  useEffect(() => {
    setProjectId(projectId);
  }, [projectId, setProjectId]);

  // --- Fetch traces for the session ---
  useEffect(() => {
    setSession({ sessionId });
    const controller = new AbortController();
    const fetchTraces = async () => {
      setIsTracesLoading(true);
      setTracesError(undefined);
      try {
        const { traces, error } = await fetchSessionTraces(projectId, sessionId, controller.signal);
        if (traces) setTraces(traces);
        else setTracesError(error);
      } catch {
        // Aborted: a newer session or unmount superseded this load.
      } finally {
        if (!controller.signal.aborted) setIsTracesLoading(false);
      }
    };
    fetchTraces();
    return () => controller.abort();
  }, [projectId, sessionId, setTraces, setIsTracesLoading, setTracesError, setSession]);

  const panels: SessionViewPanels = useMemo(
    () => ({
      sessionPanel: (
        <SessionPanel
          searchSlot={<RegularSearchSlot />}
          timelineToggle={<RegularTimelineToggle />}
          timelinePanel={
            sessionTimelineEnabled ? (
              <SessionTimeline
                selectedSpan={selectedSpan}
                onSelectSpan={(traceId, spanId) => setSelectedSpan({ traceId, spanId })}
              />
            ) : undefined
          }
        />
      ),
    }),
    [sessionTimelineEnabled, selectedSpan, setSelectedSpan]
  );

  return <FillWidthLayout panels={panels} />;
}
