import { ChevronDown, ChevronsRight, Copy, Database, Loader, Maximize, Radio, Sparkles } from "lucide-react";
import NextLink from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { memo, useCallback, useEffect, useMemo } from "react";
import { shallow } from "zustand/shallow";

import { jsonSchemaToSchemaFields } from "@/components/signals/utils";
import TagsContextProvider from "@/components/tags/tags-context";
import TagsList from "@/components/tags/tags-list";
import TagsTrigger from "@/components/tags/tags-trigger";
import ShareTraceButton from "@/components/traces/share-trace-button";
import TraceViewSearch from "@/components/traces/trace-view/search";
import { type TraceViewSpan, useTraceViewStore } from "@/components/traces/trace-view/store";
import { type TraceSignal } from "@/components/traces/trace-view/store/base";
import { useOpenInSql } from "@/components/traces/trace-view/use-open-in-sql.tsx";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type Filter } from "@/lib/actions/common/filters";
import { type EventRow } from "@/lib/events/types";
import { useToast } from "@/lib/hooks/use-toast";
import { cn } from "@/lib/utils";

import Metadata from "../metadata";
import ResizableSignalCard from "./resizeable-signal-card";
import CondensedTimelineControls from "./timeline-toggle";

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

  const { toast } = useToast();
  const { openInSql, isLoading: isSqlLoading } = useOpenInSql({
    projectId: projectId as string,
    params: { type: "trace", traceId: traceId },
  });

  const handleCopyTraceId = useCallback(async () => {
    if (trace?.id) {
      await navigator.clipboard.writeText(trace.id);
      toast({ title: "Copied trace ID", duration: 1000 });
    }
  }, [trace?.id, toast]);

  const fullScreenParams = useMemo(() => {
    const ps = new URLSearchParams(searchParams);
    if (params.evaluationId) {
      ps.set("evaluationId", params.evaluationId as string);
    }
    return ps;
  }, [params.evaluationId, searchParams]);

  const signalCount = traceSignals.length;

  return (
    <div className="relative flex flex-col gap-1.5 px-2 pt-1.5 pb-2 flex-shrink-0">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center min-w-0 gap-2">
          {!params?.traceId && (
            <div className="flex items-center flex-shrink-0 gap-0.5">
              <Button variant="ghost" className="px-0.5" onClick={handleClose}>
                <ChevronsRight className="w-5 h-5" />
              </Button>
              {trace && (
                <NextLink passHref href={`/project/${projectId}/traces/${trace?.id}?${fullScreenParams.toString()}`}>
                  <Button variant="ghost" className="px-0.5">
                    <Maximize className="w-4 h-4" />
                  </Button>
                </NextLink>
              )}
            </div>
          )}
          {trace && (
            <div className="flex">
              <span className="text-base font-medium ml-2 flex-shrink-0">Trace</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="h-6 px-1 hover:bg-secondary">
                    <ChevronDown className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={handleCopyTraceId}>
                    <Copy size={14} />
                    Copy trace ID
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={isSqlLoading} onClick={openInSql}>
                    {isSqlLoading ? <Loader className="size-3.5 animate-spin" /> : <Database className="size-3.5" />}
                    Open in SQL editor
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
          {signalCount > 0 && (
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
          )}
          {spans.length > 0 && (
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
          )}
        </div>
        <div className="flex items-center gap-x-0.5 flex-shrink-0">
          <Metadata metadata={trace?.metadata} />
          {trace && <ShareTraceButton projectId={projectId} />}
        </div>
      </div>
      {signalsPanelOpen && <ResizableSignalCard traceId={traceId} onClose={() => setSignalsPanelOpen(false)} />}
      <TagsContextProvider mode={{ type: "trace", traceId }}>
        <div className="flex flex-wrap gap-1 items-center">
          <TagsList />
          <TagsTrigger />
        </div>
      </TagsContextProvider>
      <div className="flex items-center gap-2">
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
