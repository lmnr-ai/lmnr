import { ArrowUpRight, ChevronsRight, Layers, Maximize, Radio, Sparkles, User } from "lucide-react";
import NextLink from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { memo, useCallback, useEffect, useMemo } from "react";
import { shallow } from "zustand/shallow";

import { jsonSchemaToSchemaFields } from "@/components/signals/utils";
import { TraceTagsButton, TraceTagsPills, useTraceTags } from "@/components/tags/trace-tags-list";
import ShareTraceButton from "@/components/traces/share-trace-button";
import TraceViewSearch from "@/components/traces/trace-view/search";
import { type TraceViewSpan, useTraceViewStore } from "@/components/traces/trace-view/store";
import { type TraceSignal } from "@/components/traces/trace-view/store/base";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { type Filter } from "@/lib/actions/common/filters";
import { type EventRow } from "@/lib/events/types";
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

  const sessionId = trace?.sessionId;
  const hasSession = sessionId && sessionId !== "<null>" && sessionId !== "";

  const handleOpenSession = useCallback(() => {
    if (!hasSession) return;
    const searchParams = new URLSearchParams(window.location.search);
    searchParams.set("sessionId", sessionId);
    searchParams.delete("traceId");
    searchParams.delete("spanId");
    window.open(`/project/${projectId}/traces?${searchParams.toString()}`, "_blank");
  }, [hasSession, sessionId, projectId]);

  const userId = trace?.userId;
  const hasUser = userId && userId !== "<null>" && userId !== "";

  const { tags: traceTags } = useTraceTags(traceId);
  const hasRow2 = hasSession || hasUser || traceTags.length > 0;

  const handleOpenUserTraces = useCallback(() => {
    if (!hasUser) return;
    const params = new URLSearchParams();
    params.append("filter", JSON.stringify({ column: "user_id", value: userId, operator: "eq" }));
    params.set("pastHours", "2160");
    window.open(`/project/${projectId}/traces?${params.toString()}`, "_blank");
  }, [hasUser, userId, projectId]);

  return (
    <div className="relative flex flex-col px-2 pt-1.5 pb-2 flex-shrink-0">
      {/* Row 1: core trace controls + actions (share justified to end) */}
      <div className="flex items-center gap-1">
        <div className="flex items-center gap-1 flex-1 min-w-0">
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
          <span className={HEADER_ITEM_CLS}>
            <Metadata metadata={trace?.metadata} />
          </span>
          <span className={HEADER_ITEM_CLS}>
            <TraceTagsButton traceId={traceId} />
          </span>
        </div>
        {trace && <ShareTraceButton projectId={projectId} />}
      </div>
      {/* Row 2: context pills (session, user, tags) */}
      {hasRow2 && (
        <div className="flex flex-wrap items-center gap-1 mt-1.5">
          {hasSession && (
            <span className={HEADER_ITEM_CLS}>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={handleOpenSession}
                      variant="outline"
                      className="h-6 text-xs px-1.5 hover:bg-secondary max-w-56"
                    >
                      <Layers size={14} className="mr-1 flex-shrink-0" />
                      <span className="truncate">{sessionId}</span>
                      <ArrowUpRight size={16} className="ml-1 flex-shrink-0 text-muted-foreground" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Open session in a new tab</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </span>
          )}
          {hasUser && (
            <span className={HEADER_ITEM_CLS}>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={handleOpenUserTraces}
                      variant="outline"
                      className="h-6 text-xs px-1.5 hover:bg-secondary max-w-40"
                    >
                      <User size={14} className="mr-1 flex-shrink-0" />
                      <span className="truncate">{userId}</span>
                      <ArrowUpRight size={16} className="ml-1 flex-shrink-0 text-muted-foreground" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">See user traces in a new tab</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </span>
          )}
          <TraceTagsPills traceId={traceId} />
        </div>
      )}
      {signalsPanelOpen && (
        <ResizableSignalCard traceId={traceId} onClose={() => setSignalsPanelOpen(false)} className="mt-2" />
      )}
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
