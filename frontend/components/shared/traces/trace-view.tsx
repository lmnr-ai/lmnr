"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import React, { useCallback, useEffect } from "react";
import { shallow } from "zustand/shallow";

import LandingHeader from "@/components/landing/header";
import { SpanView } from "@/components/shared/traces/span-view";
import TracePanel from "@/components/shared/traces/trace-panel";
import FillWidthLayout, { STACK_THRESHOLD } from "@/components/traces/trace-view/fill-width-layout";
import TraceViewStoreProvider, {
  type TraceViewSpan,
  type TraceViewTrace,
  useTraceViewStore,
} from "@/components/traces/trace-view/store";
import { useTraceSignals } from "@/components/traces/trace-view/use-trace-signals";
import { enrichSpansWithPending } from "@/components/traces/trace-view/utils";

interface TraceViewProps {
  trace: TraceViewTrace;
  spans: TraceViewSpan[];
  onClose?: () => void;
  /** Drives the page header's Dashboard vs Sign in/up buttons. Only read on the
   *  full-page variant (no `onClose`); the eval side-panel renders no page header. */
  hasSession?: boolean;
}

export const PureTraceView = ({ trace, spans, onClose, hasSession = false }: TraceViewProps) => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathName = usePathname();

  const { setSpans, setTrace, selectedSpan, setSelectedSpan, spanPanelOpen, setBrowserSession, setHasBrowserSession } =
    useTraceViewStore(
      (state) => ({
        setSpans: state.setSpans,
        setTrace: state.setTrace,
        selectedSpan: state.selectedSpan,
        setSelectedSpan: state.setSelectedSpan,
        spanPanelOpen: state.spanPanelOpen,
        setBrowserSession: state.setBrowserSession,
        setHasBrowserSession: state.setHasBrowserSession,
      }),
      shallow
    );

  useTraceSignals(`/api/shared/traces/${trace.id}/signals`);

  const handleSpanSelect = useCallback(
    (span?: TraceViewSpan) => {
      if (span) {
        const params = new URLSearchParams(searchParams);
        params.set("spanId", span.spanId);
        router.replace(`${pathName}?${params.toString()}`);
      }
      setSelectedSpan(span);
    },
    [pathName, router, searchParams, setSelectedSpan]
  );

  const handleSpanPanelClose = useCallback(() => {
    setSelectedSpan(undefined);
    if (searchParams.has("spanId")) {
      const params = new URLSearchParams(searchParams);
      params.delete("spanId");
      router.replace(`${pathName}?${params.toString()}`);
    }
  }, [setSelectedSpan, searchParams, router, pathName]);

  useEffect(() => {
    if (trace.hasBrowserSession) {
      setHasBrowserSession(true);
      setBrowserSession(true);
    }
  }, []);

  useEffect(() => {
    const enrichedSpans = enrichSpansWithPending(spans);
    setSpans(enrichedSpans);
    setTrace(trace);

    const spanId = searchParams.get("spanId");
    const linkedSpan = spanId ? spans?.find((s) => s.spanId === spanId) : undefined;
    // Narrow layouts stack the span over the tree, so only a linked span opens on load.
    const narrow = window.innerWidth < STACK_THRESHOLD;
    const span = linkedSpan ?? (narrow ? undefined : spans?.[0]);

    if (span) {
      setSelectedSpan({ ...span, collapsed: false });
    }
  }, []);

  const panels = {
    tracePanel: <TracePanel trace={trace} spans={spans} onClose={onClose} onSpanSelect={handleSpanSelect} />,
    spanPanel: selectedSpan ? (
      <SpanView
        key={selectedSpan.spanId}
        spanId={selectedSpan.spanId}
        traceId={trace.id}
        onClose={handleSpanPanelClose}
      />
    ) : null,
    showSpan: spanPanelOpen,
  };

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      {!onClose && (
        <div className="flex-none border-b">
          {/* py-4 keeps the header at the 60px the mobile menu overlay is pinned to. */}
          <LandingHeader hasSession={hasSession} className="w-full px-4 py-4 md:px-6" />
        </div>
      )}
      {/* isolate: inner z-indexed handles must not cover the header's mobile menu overlay. */}
      <div className="flex flex-1 min-h-0 overflow-hidden isolate">
        <FillWidthLayout panels={panels} />
      </div>
    </div>
  );
};

export default function TraceView(props: TraceViewProps) {
  return (
    <TraceViewStoreProvider storeKey="shared-trace-view">
      <PureTraceView {...props} />
    </TraceViewStoreProvider>
  );
}
