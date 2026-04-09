import { AnimatePresence, motion } from "framer-motion";
import { ChevronsRight, Maximize, Sparkles } from "lucide-react";
import NextLink from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { memo, useEffect, useMemo, useRef } from "react";
import { shallow } from "zustand/shallow";

import { useTraceSignals } from "@/components/signals/use-trace-signals";
import { DEFAULT_SIGNAL_COLOR } from "@/components/signals/utils";
import TraceTagsButton from "@/components/tags/trace-tags-button";
import ShareTraceButton from "@/components/traces/share-trace-button";
import TraceViewSearch from "@/components/traces/trace-view/search";
import { type TraceViewSpan, useTraceViewStore } from "@/components/traces/trace-view/store";
import { Button } from "@/components/ui/button";
import { type Filter } from "@/lib/actions/common/filters";
import { cn } from "@/lib/utils";

import Metadata from "../metadata";
import ResizableSignalCard from "./resizeable-signal-card";
import CondensedTimelineControls from "./timeline-toggle";
import TraceDropdown from "./trace-dropdown";

const HEADER_ITEM_CLS = "flex items-center h-7";

interface HeaderProps {
  handleClose: () => void;
  spans: TraceViewSpan[];
  onSearch: (filters: Filter[], search: string) => void;
  traceId: string;
}

const Header = ({ handleClose, spans, onSearch, traceId }: HeaderProps) => {
  const params = useParams();
  const searchParams = useSearchParams();
  const projectId = params?.projectId as string;

  const {
    trace,
    condensedTimelineEnabled,
    setCondensedTimelineEnabled,
    tracesAgentOpen,
    setTracesAgentOpen,
    signalsPanelOpen,
    setSignalsPanelOpen,
    setActiveSignalTabId,
    initialSignalId,
  } = useTraceViewStore(
    (state) => ({
      trace: state.trace,
      condensedTimelineEnabled: state.condensedTimelineEnabled,
      setCondensedTimelineEnabled: state.setCondensedTimelineEnabled,
      tracesAgentOpen: state.tracesAgentOpen,
      setTracesAgentOpen: state.setTracesAgentOpen,
      signalsPanelOpen: state.signalsPanelOpen,
      setSignalsPanelOpen: state.setSignalsPanelOpen,
      setActiveSignalTabId: state.setActiveSignalTabId,
      initialSignalId: state.initialSignalId,
    }),
    shallow
  );

  const { signals: traceSignals, isLoading: isTraceSignalsLoading } = useTraceSignals(traceId);

  // Auto-open signals panel and select tab when SWR data arrives
  const hasAutoOpened = useRef(false);
  useEffect(() => {
    if (hasAutoOpened.current || traceSignals.length === 0) return;
    hasAutoOpened.current = true;
    setSignalsPanelOpen(true);
    const preferred = initialSignalId ? traceSignals.find((s) => s.signalId === initialSignalId) : undefined;
    setActiveSignalTabId(preferred?.signalId ?? traceSignals[0].signalId);
  }, [traceSignals, initialSignalId, setSignalsPanelOpen, setActiveSignalTabId]);

  const fullScreenParams = useMemo(() => {
    const ps = new URLSearchParams(searchParams);
    if (params.evaluationId) {
      ps.set("evaluationId", params.evaluationId as string);
    }
    return ps;
  }, [params.evaluationId, searchParams]);

  const signalCount = traceSignals.length;

  return (
    <div className="relative flex flex-col px-2 pt-1.5 pb-2 flex-shrink-0">
      <div className="flex items-start gap-1">
        <div className="flex flex-wrap items-center gap-1 flex-1">
          {!params?.traceId && (
            <span className={cn(HEADER_ITEM_CLS, "gap-0.5")}>
              <Button variant="ghost" className="h-7 px-0.5" onClick={handleClose}>
                <ChevronsRight className="w-5 h-5" />
              </Button>
              {trace && (
                <NextLink passHref href={`/project/${projectId}/traces/${trace?.id}?${fullScreenParams.toString()}`}>
                  <Button variant="ghost" className="h-7 px-0.5">
                    <Maximize className="w-4 h-4" />
                  </Button>
                </NextLink>
              )}
            </span>
          )}
          {trace && (
            <span className={HEADER_ITEM_CLS}>
              <span className="text-base font-medium pl-2 flex-shrink-0">Trace</span>
              <TraceDropdown traceId={traceId} />
            </span>
          )}
          {spans.length > 0 && (
            <span className={HEADER_ITEM_CLS}>
              <Button
                onClick={() => setTracesAgentOpen(!tracesAgentOpen)}
                variant="outline"
                className={cn(
                  "h-6 text-xs px-1.5",
                  tracesAgentOpen ? "border-primary text-primary hover:bg-primary/10" : "hover:bg-secondary"
                )}
              >
                <Sparkles size={14} className="mr-1" />
                Chat
              </Button>
            </span>
          )}
          {signalCount > 0 && !signalsPanelOpen && (
            <motion.span className={HEADER_ITEM_CLS} layout layoutId="signals-panel-layout">
              <Button
                onClick={() => setSignalsPanelOpen(true)}
                variant="outline"
                className="h-6 text-xs px-1.5 gap-1.5 hover:bg-secondary"
              >
                <div className="flex -space-x-[8px]">
                  {traceSignals.map((signal) => (
                    <motion.div
                      key={signal.signalId}
                      layout
                      layoutId={`trace-signals-layout-${signal.signalId}`}
                      className="size-3.5 rounded-full border border-background"
                      style={{ background: signal.color ?? DEFAULT_SIGNAL_COLOR }}
                      transition={{ layout: { type: "spring", stiffness: 300, damping: 30 } }}
                    />
                  ))}
                </div>
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1, transition: { delay: 0.3 } }}
                  exit={{ opacity: 0, transition: { duration: 0.1, delay: 0 } }}
                >
                  Signals
                </motion.span>
              </Button>
            </motion.span>
          )}
          <span className={HEADER_ITEM_CLS}>
            <TraceTagsButton traceId={traceId} />
          </span>
          {trace?.metadata && (
            <span className={HEADER_ITEM_CLS}>
              <Metadata metadata={trace?.metadata} />
            </span>
          )}
        </div>
        {trace && <ShareTraceButton projectId={projectId} />}
      </div>
      <AnimatePresence>
        {signalsPanelOpen && (
          <ResizableSignalCard
            traceId={traceId}
            traceSignals={traceSignals}
            isTraceSignalsLoading={isTraceSignalsLoading}
            onClose={() => setSignalsPanelOpen(false)}
          />
        )}
      </AnimatePresence>
      <div className="flex items-center gap-2 mt-2">
        <TraceViewSearch
          spans={spans}
          onSubmit={onSearch}
          className="flex-1"
          initialSearch={searchParams.get("search") ?? undefined}
        />
      </div>
      {spans.length > 0 && (
        <CondensedTimelineControls enabled={condensedTimelineEnabled} setEnabled={setCondensedTimelineEnabled} />
      )}
    </div>
  );
};

export default memo(Header);
