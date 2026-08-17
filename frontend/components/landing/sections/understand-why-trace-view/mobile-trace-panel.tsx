"use client";

import useSWR from "swr";

import TraceViewStoreProvider, { type TraceViewSpan, type TraceViewTrace } from "@/components/traces/trace-view/store";
import { swrFetcher } from "@/lib/utils";

import { DEMO_TRACE_ID } from "../demo-trace";
import { SIGNAL_SOURCE_SPAN_ID } from "../signal-event-card";
import TraceViewErrorBoundary from "./error-boundary";
import { SHARED_TRACE_API } from "./shared-trace-api";
import TracePanel from "./trace-panel";

interface Props {
  /** Distinct per instance. Two panels share this page, and one store would let
   *  a span selected in either one scroll BOTH transcripts. */
  storeKey: string;
  /** Adds the signal event card, as desktop step 3 does. */
  showSignals?: boolean;
}

// The desktop trace panel, reused verbatim on mobile — same component, same
// trace, same steps' worth of state — so the two can never drift.
//
// Desktop gives it a 680px frame; here the caller crops it instead, so the
// transcript runs off the bottom edge under a gradient rather than ending. Its
// scroll is locked for that reason: on touch an inner scroller only traps the
// page.
//
// Both reads use the same SWR keys as the desktop section, so on the widths
// where both trees are mounted this costs no extra request.
const MobileTracePanel = ({ storeKey, showSignals }: Props) => {
  const { data: trace } = useSWR<TraceViewTrace>(`${SHARED_TRACE_API}/${DEMO_TRACE_ID}`, swrFetcher);
  const { data: spans } = useSWR<TraceViewSpan[]>(`${SHARED_TRACE_API}/${DEMO_TRACE_ID}/spans`, swrFetcher);

  return (
    <TraceViewErrorBoundary>
      <TraceViewStoreProvider storeKey={storeKey} initialTrace={trace}>
        <TracePanel
          trace={trace}
          spans={spans ?? []}
          // Off on mobile: the crop is short and the transcript is what the
          // copy is about, so a timeline only costs it 120px.
          showTimeline={false}
          visibleRows={Number.POSITIVE_INFINITY}
          showSignals={showSignals}
          signalsOpen={showSignals}
          // Only meaningful with the card open — it exists to point the
          // transcript at the span the signal fired on.
          revealSpanId={showSignals ? SIGNAL_SOURCE_SPAN_ID : undefined}
          scrollLocked
        />
      </TraceViewStoreProvider>
    </TraceViewErrorBoundary>
  );
};

export default MobileTracePanel;
