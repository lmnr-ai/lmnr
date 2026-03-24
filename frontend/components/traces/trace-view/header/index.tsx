import { ChevronDown, ChevronsRight, Copy, Database, Loader, Maximize, Radio, Sparkles, X } from "lucide-react";
import NextLink from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { shallow } from "zustand/shallow";

import { jsonSchemaToSchemaFields } from "@/components/signals/utils";
import ShareTraceButton from "@/components/traces/share-trace-button";
import TraceViewSearch from "@/components/traces/trace-view/search";
import SignalEventsPanel from "@/components/traces/trace-view/signal-events-panel";
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
import CondensedTimelineControls from "./timeline-toggle";

const DEFAULT_SIGNAL_CARD_HEIGHT = 300;
const MIN_SIGNAL_CARD_HEIGHT = 80;
const MAX_SIGNAL_CARD_HEIGHT = 500;

function ResizableSignalCard({ traceId, onClose }: { traceId: string; onClose: () => void }) {
  const [height, setHeight] = useState(DEFAULT_SIGNAL_CARD_HEIGHT);
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startHeight = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      isDragging.current = true;
      startY.current = e.clientY;
      startHeight.current = height;
      e.preventDefault();

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!isDragging.current) return;
        const delta = moveEvent.clientY - startY.current;
        const newHeight = Math.min(
          MAX_SIGNAL_CARD_HEIGHT,
          Math.max(MIN_SIGNAL_CARD_HEIGHT, startHeight.current + delta)
        );
        setHeight(newHeight);
      };

      const handleMouseUp = () => {
        isDragging.current = false;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [height]
  );

  return (
    <div className="flex flex-col rounded-md border bg-card overflow-hidden" style={{ height }}>
      <div className="flex-shrink-0 pr-2 pl-2.5 pt-1.5 flex items-center justify-between">
        <span className="text-xs font-medium text-secondary-foreground">Signal events</span>
        <Button variant="ghost" className="h-6 w-6 p-0" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden px-2">
        <SignalEventsPanel traceId={traceId} />
      </div>
      <div
        onMouseDown={handleMouseDown}
        className="h-1.5 cursor-row-resize flex items-center justify-center hover:bg-muted/60 transition-colors shrink-0"
      >
        <div className="w-8 h-0.5 rounded-full bg-border" />
      </div>
    </div>
  );
}

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
  const hasFetchedSignalsRef = useRef(false);
  useEffect(() => {
    if (!traceId || !projectId || hasFetchedSignalsRef.current || traceSignals.length > 0) return;
    hasFetchedSignalsRef.current = true;

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
  }, [
    traceId,
    projectId,
    traceSignals.length,
    setTraceSignals,
    setIsTraceSignalsLoading,
    initialSignalId,
    setActiveSignalTabId,
  ]);

  const { toast } = useToast();
  const { openInSql, isLoading: isSqlLoading } = useOpenInSql({
    projectId: projectId as string,
    params: { type: "trace", traceId: String(trace?.id) },
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
          <Button
            onClick={() => setTracesAgentOpen(!tracesAgentOpen)}
            variant="outline"
            className={cn(
              "h-6 text-xs px-1.5",
              tracesAgentOpen ? "border-primary text-primary hover:bg-primary/10" : "hover:bg-secondary"
            )}
          >
            <Sparkles size={14} className="mr-1" />
            Chat with trace
          </Button>
        </div>
        <div className="flex items-center gap-x-0.5 flex-shrink-0">
          <Metadata metadata={trace?.metadata} />
          {trace && <ShareTraceButton projectId={projectId} />}
        </div>
      </div>
      {signalsPanelOpen && <ResizableSignalCard traceId={traceId} onClose={() => setSignalsPanelOpen(false)} />}
      <div className="flex items-center gap-2">
        <TraceViewSearch spans={spans} onSubmit={onSearch} className="flex-1" />
      </div>
      {spans.length > 0 && (
        <CondensedTimelineControls enabled={condensedTimelineEnabled} setEnabled={setCondensedTimelineEnabled} />
      )}
    </div>
  );
};

export default memo(Header);
