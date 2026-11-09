import { AnimatePresence } from "framer-motion";

import { TraceAgentContext } from "@/components/agent";
import TraceViewStoreProvider from "@/components/traces/trace-view/store";

import SidePanel, { type SidePanelProps } from "./side-panel";
import TraceViewContent from "./trace-view-content";
import { type TraceViewProps } from "./trace-view-panels";

export default function TraceView(props: Omit<TraceViewProps, "isFillWidth">) {
  return (
    <TraceViewStoreProvider
      initialTrace={props.propsTrace}
      isAlwaysSelectSpan={props.isAlwaysSelectSpan}
      initialSignalId={props.initialSignalId}
      initialSearch={props.initialSearch}
      urlState={props.urlState}
      storeKey={props.storeKey}
    >
      <TraceAgentContext traceId={props.traceId} />
      <TraceViewContent {...props} />
    </TraceViewStoreProvider>
  );
}

/**
 * The trace drawer: renders nothing without a trace, slides in when one opens and out when it closes.
 * Callers render it unconditionally; it owns its presence animation.
 */
export function TraceViewSidePanel({
  traceId,
  ...props
}: Omit<SidePanelProps, "traceId"> & { traceId: string | null | undefined }) {
  return (
    <AnimatePresence>{traceId && <SidePanel key="trace-side-panel" traceId={traceId} {...props} />}</AnimatePresence>
  );
}
