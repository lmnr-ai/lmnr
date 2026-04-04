import { ChevronsRight, Maximize, Radio, Sparkles } from "lucide-react";
import NextLink from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { memo, useEffect, useMemo } from "react";
import { shallow } from "zustand/shallow";

import { jsonSchemaToSchemaFields } from "@/components/signals/utils";
import TagsButton from "@/components/tags/tags-button";
import ShareTraceButton from "@/components/traces/share-trace-button";
import TraceViewSearch from "@/components/traces/trace-view/search";
import { type TraceViewSpan, useTraceViewStore } from "@/components/traces/trace-view/store";
import { type TraceSignal } from "@/components/traces/trace-view/store/base";
import { Button } from "@/components/ui/button";
import { type Filter } from "@/lib/actions/common/filters";
import { type EventRow } from "@/lib/events/types";
import { cn } from "@/lib/utils";

import Metadata from "../metadata";
import ResizableSignalCard from "./resizeable-signal-card";
import CondensedTimelineControls from "./timeline-toggle";
import TraceDropdown from "./trace-dropdown";

const HEADER_ITEM_CLS = "flex items-center h-[28px]";

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
    traceSignals,
    setTraceSignals,
    setIsTraceSignalsLoading,
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
      traceSignals: state.traceSignals,
      setTraceSignals: state.setTraceSignals,
      setIsTraceSignalsLoading: state.setIsTraceSignalsLoading,
      setActiveSignalTabId: state.setActiveSignalTabId,
      initialSignalId: state.initialSignalId,
    }),
    shallow
  );

  // Eagerly fetch signal count when trace loads, so the button shows the correct count.
  // Tab selection uses initialSignalId from the store (set at creation time) — see
  // SignalEventsPanel for the same logic. Whichever fetch completes first picks the tab.
  useEffect(() => {
    if (!traceId || !projectId) return;

    const fetchSignals = async () => {
      try {
        setIsTraceSignalsLoading(true);
        const response = await fetch(`/api/projects/${projectId}/traces/${traceId}/signals`);
        if (!response.ok) return;

        const data = (await response.json()) as Array<{
          signalId: string;
          signalName: string;
          prompt: string;
          structuredOutput: Record<string, unknown>;
          events: EventRow[];
        }>;
        if (!Array.isArray(data)) return;

        const mapped: TraceSignal[] = data.map((s) => ({
          signalId: s.signalId,
          signalName: s.signalName,
          prompt: s.prompt ?? "",
          schemaFields: jsonSchemaToSchemaFields(s.structuredOutput).map((f) => ({
            name: f.name,
            type: f.type,
            description: f.description,
          })),
          events: Array.isArray(s.events) ? s.events : [],
        }));

        setTraceSignals(mapped);

        if (mapped.length > 0) {
          setSignalsPanelOpen(true);
          const preferred = initialSignalId ? mapped.find((s) => s.signalId === initialSignalId) : undefined;
          setActiveSignalTabId(preferred?.signalId ?? mapped[0].signalId);
        }
      } catch (error) {
        console.error("Error fetching trace signals:", error);
      } finally {
        setIsTraceSignalsLoading(false);
      }
    };

    fetchSignals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
              <Button variant="ghost" className="h-[28px] px-0.5" onClick={handleClose}>
                <ChevronsRight className="w-5 h-5" />
              </Button>
              {trace && (
                <NextLink passHref href={`/project/${projectId}/traces/${trace?.id}?${fullScreenParams.toString()}`}>
                  <Button variant="ghost" className="h-[28px] px-0.5">
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
          {trace?.metadata && (
            <span className={HEADER_ITEM_CLS}>
              <Metadata metadata={trace?.metadata} />
            </span>
          )}
          <span className={HEADER_ITEM_CLS}>
            <TagsButton mode={{ type: "trace", traceId }} />
          </span>
          {signalCount > 0 && (
            <span className={HEADER_ITEM_CLS}>
              <Button
                onClick={() => setSignalsPanelOpen(!signalsPanelOpen)}
                variant="outline"
                className={cn(
                  "h-6 text-xs px-1.5",
                  signalsPanelOpen ? "border-primary text-primary hover:bg-primary/10" : "hover:bg-secondary"
                )}
              >
                <Radio size={14} className="mr-1" />
                Signals ({signalCount})
              </Button>
            </span>
          )}
        </div>
        {trace && <ShareTraceButton projectId={projectId} />}
      </div>
      {signalsPanelOpen && <ResizableSignalCard traceId={traceId} onClose={() => setSignalsPanelOpen(false)} />}
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
