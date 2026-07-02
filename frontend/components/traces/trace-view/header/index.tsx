import { AnimatePresence } from "framer-motion";
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
import { type TraceSignal, type TraceSignalClusterNode } from "@/components/traces/trace-view/store/base";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useFeatureFlags } from "@/contexts/feature-flags-context";
import { useProjectContext } from "@/contexts/project-context";
import { type Filter } from "@/lib/actions/common/filters";
import { type EventRow } from "@/lib/events/types";
import { Feature } from "@/lib/features/features";
import { useToast } from "@/lib/hooks/use-toast";
import { track } from "@/lib/posthog";
import { cn } from "@/lib/utils";

import Metadata from "../metadata";
import SignalEventsPanel from "../signal-events-panel";
import CondensedTimelineControls from "./timeline-toggle";
import TraceDropdown from "./trace-dropdown";

const HEADER_ITEM_CLS = "flex items-center h-7";

const FREE_TIER_RETENTION_DAYS = 7;

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
  const { toast } = useToast();
  const { project } = useProjectContext();
  const featureFlags = useFeatureFlags();

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
    initialSearch,
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
      initialSearch: state.initialSearch,
    }),
    shallow
  );

  // Eagerly fetch signals when the trace loads, populating store + auto-opening the panel
  // when there are any. Tab selection prefers initialSignalId from the store (set at creation).
  useEffect(() => {
    if (!traceId || !projectId) return;

    const fetchSignals = async () => {
      try {
        setIsTraceSignalsLoading(true);
        const response = await fetch(`/api/projects/${projectId}/traces/${traceId}/signals`);
        if (!response.ok) {
          const errMessage = await response
            .json()
            .then((d) => d?.error)
            .catch(() => null);
          toast({ variant: "destructive", title: errMessage ?? "Failed to load trace signals" });
          return;
        }

        const data = (await response.json()) as Array<{
          signalId: string;
          signalName: string;
          prompt: string;
          structuredOutput: Record<string, unknown>;
          leafCluster?: TraceSignalClusterNode | null;
          events: Array<EventRow & { leafCluster?: TraceSignalClusterNode | null }>;
        }>;
        if (!Array.isArray(data)) return;

        const mapped: TraceSignal[] = data.map((s) => ({
          signalId: s.signalId,
          signalName: s.signalName,
          prompt: s.prompt ?? "",
          leafCluster: s.leafCluster ?? null,
          schemaFields: jsonSchemaToSchemaFields(s.structuredOutput).map((f) => ({
            name: f.name,
            type: f.type,
            description: f.description,
          })),
          events: Array.isArray(s.events)
            ? s.events.map((e) => ({
                id: e.id,
                signalId: e.signalId,
                traceId: e.traceId,
                payload: e.payload,
                timestamp: e.timestamp,
                severity: e.severity,
                leafCluster: e.leafCluster ?? null,
              }))
            : [],
        }));

        setTraceSignals(mapped);

        if (mapped.length > 0) {
          setSignalsPanelOpen(true);
          // A deep link with eventId points at one specific finding — open the
          // signal tab that owns it so the highlighted card is visible. Fall
          // back to the initial signal, then the first signal.
          const eventId = searchParams.get("eventId");
          const owner = eventId ? mapped.find((s) => s.events.some((e) => e.id === eventId)) : undefined;
          const preferred = initialSignalId ? mapped.find((s) => s.signalId === initialSignalId) : undefined;
          setActiveSignalTabId(owner?.signalId ?? preferred?.signalId ?? mapped[0].signalId);
        }
      } catch {
        toast({ variant: "destructive", title: "Failed to load trace signals" });
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
    track("sessions", "detail_opened", { source: "trace_header" });
    const encodedSessionId = sessionId.split("/").map(encodeURIComponent).join("/");
    window.open(`/project/${projectId}/sessions/${encodedSessionId}`, "_blank");
  }, [hasSession, sessionId, projectId]);

  const userId = trace?.userId;
  const hasUser = userId && userId !== "<null>" && userId !== "";

  const { tags: traceTags } = useTraceTags(traceId);
  const hasRow2 = hasSession || hasUser || traceTags.length > 0;

  const handleOpenUserTraces = useCallback(() => {
    if (!hasUser) return;
    const params = new URLSearchParams();
    params.append("filter", JSON.stringify({ column: "user_id", value: userId, operator: "eq" }));
    const retentionDays = project?.logRetentionDays ?? FREE_TIER_RETENTION_DAYS;
    params.set("pastHours", String(retentionDays * 24));
    window.open(`/project/${projectId}/traces?${params.toString()}`, "_blank");
  }, [hasUser, userId, projectId, project?.logRetentionDays]);

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
          {featureFlags[Feature.AGENT] && spans.length > 0 && (
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
      <AnimatePresence>
        {signalsPanelOpen && (
          <SignalEventsPanel
            traceId={traceId}
            onClose={() => {
              track("traces", "signals_panel_closed");
              setSignalsPanelOpen(false);
            }}
            className="mt-2"
          />
        )}
      </AnimatePresence>
      <div className="flex items-center gap-2 mt-2">
        <TraceViewSearch
          spans={spans}
          onSubmit={onSearch}
          className="flex-1"
          initialSearch={initialSearch || undefined}
        />
      </div>
      {spans.length > 0 && (
        <CondensedTimelineControls enabled={condensedTimelineEnabled} setEnabled={setCondensedTimelineEnabled} />
      )}
    </div>
  );
};

export default memo(Header);
