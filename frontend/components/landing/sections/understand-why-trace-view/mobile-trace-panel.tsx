"use client";

import TraceViewErrorBoundary from "./error-boundary";
import { SpanSelectionProvider } from "./mock/selection";
import TracePanel from "./trace-panel";

interface Props {
  /** Adds the signal event card, as desktop step 2 does. */
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
// Its OWN selection provider, not the section's: this page mounts the panel
// twice, and one provider would let a chip in either copy scroll both
// transcripts.
const MobileTracePanel = ({ showSignals }: Props) => (
  <TraceViewErrorBoundary>
    <SpanSelectionProvider>
      <TracePanel
        // Off on mobile: the crop is short and the transcript is what the copy
        // is about, so a timeline only costs it 120px.
        showTimeline={false}
        visibleSpans={Number.POSITIVE_INFINITY}
        showSignals={showSignals}
        signalsOpen={showSignals}
        scrollLocked
      />
    </SpanSelectionProvider>
  </TraceViewErrorBoundary>
);

export default MobileTracePanel;
