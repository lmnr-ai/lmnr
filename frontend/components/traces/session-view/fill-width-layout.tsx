import React from "react";

import SessionSpanPanel from "./session-span-panel";

export interface SessionViewPanels {
  sessionPanel: React.ReactNode;
}

// Session content fills the remaining width; the span panel (last flex child)
// owns its own visibility, open/close animation, and left-edge resizability —
// see session-span-panel.tsx. Opening it pushes the session content over
// in-layout rather than overlaying it.
export default function FillWidthLayout({ panels }: { panels: SessionViewPanels }) {
  return (
    <div className="flex h-full w-full overflow-hidden">
      <div className="min-w-0 flex-1 overflow-hidden">{panels.sessionPanel}</div>
      <SessionSpanPanel />
    </div>
  );
}
