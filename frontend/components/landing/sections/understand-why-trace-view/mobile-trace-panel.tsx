"use client";

import TraceViewErrorBoundary from "./error-boundary";
import { SpanSelectionProvider } from "./mock/selection";
import TracePanel from "./trace-panel";

interface Props {
  /** Adds the signal event card, as desktop step 2 does. */
  showSignals?: boolean;
}

// The desktop panel reused verbatim, so the two can never drift. The caller
// CROPS it rather than sizing it, so the transcript runs off the bottom under a
// gradient — and its scroll is locked, since on touch an inner scroller only
// traps the page. Its OWN provider: this page mounts the panel twice.
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
