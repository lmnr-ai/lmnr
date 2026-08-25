import type { ReactNode } from "react";

export interface TraceViewPanels {
  tracePanel: ReactNode;
  spanPanel: ReactNode;
  showSpan: boolean;
}
