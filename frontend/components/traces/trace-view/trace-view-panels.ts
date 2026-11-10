import type { ReactNode } from "react";

import { type TraceViewTrace } from "@/components/traces/trace-view/store";

export interface TraceViewPanels {
  tracePanel: ReactNode;
  spanPanel: ReactNode;
  showSpan: boolean;
}

export interface TraceViewProps {
  traceId: string;
  spanId?: string;
  propsTrace?: TraceViewTrace;
  // Omit to hide the close button entirely (e.g. an always-open panel).
  onClose?: () => void;
  isFillWidth?: boolean;
  isAlwaysSelectSpan?: boolean;
  initialSignalId?: string;
  initialSearch?: string;
  /** The page reopens this trace and its span from the URL, so views keep tabs and message links there. */
  urlState?: boolean;
  // Separate persisted layout/toggles from the main trace view (e.g. when embedded elsewhere).
  storeKey?: string;
}

/** How TraceViewContent lays out its panels; the side panel resolves it from its container's width. */
export type TraceViewLayout =
  | { type: "fill" }
  /** Trace + span at px widths within `maxWidth`; `slideIn` slides the trace in from zero on mount. */
  | { type: "dynamic"; maxWidth: number; slideIn: boolean };
