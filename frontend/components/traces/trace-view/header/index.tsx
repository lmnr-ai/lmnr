import { ChevronDown, ChevronsRight, Copy, Database, GitFork, Loader, Maximize, Sparkles, X } from "lucide-react";
import NextLink from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { memo, useCallback, useMemo, useState } from "react";

import ShareTraceButton from "@/components/traces/share-trace-button";
import OpenInDebuggerDialog from "@/components/traces/trace-view/open-in-debugger-dialog.tsx";
import TraceViewSearch from "@/components/traces/trace-view/search";
import { type TraceViewSpan, useTraceViewStoreContext } from "@/components/traces/trace-view/store";
import { useOpenInSql } from "@/components/traces/trace-view/use-open-in-sql.tsx";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type Filter } from "@/lib/actions/common/filters";
import { useToast } from "@/lib/hooks/use-toast";

import Metadata from "../metadata";
import CondensedTimelineControls from "./timeline-toggle";

interface HeaderProps {
  handleClose: () => void;
  chatOpen: boolean;
  setChatOpen: (open: boolean) => void;
  spans: TraceViewSpan[];
  onSearch: (filters: Filter[], search: string) => void;
}

const Header = ({ handleClose, chatOpen, setChatOpen, spans, onSearch }: HeaderProps) => {
  const params = useParams();
  const searchParams = useSearchParams();
  const projectId = params?.projectId as string;

  const { trace, condensedTimelineEnabled, setCondensedTimelineEnabled } = useTraceViewStoreContext((state) => ({
    trace: state.trace,
    condensedTimelineEnabled: state.condensedTimelineEnabled,
    setCondensedTimelineEnabled: state.setCondensedTimelineEnabled,
  }));

  const [open, setOpen] = useState(false);
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

  return (
    <div className="relative flex flex-col gap-1.5 px-2 pt-1.5 pb-2">
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
                  <DropdownMenuItem onSelect={() => setOpen(true)} disabled={isSqlLoading}>
                    <GitFork className="size-3.5" />
                    <span>Open in debugger</span>
                  </DropdownMenuItem>

                  <DropdownMenuItem disabled={isSqlLoading} onClick={openInSql}>
                    {isSqlLoading ? <Loader className="size-3.5 animate-spin" /> : <Database className="size-3.5" />}
                    Open in SQL editor
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
          <Button
            onClick={() => setChatOpen(!chatOpen)}
            variant="outline"
            className="h-6 text-xs px-1.5 border-primary text-primary hover:bg-primary/10"
          >
            <div
              className="overflow-hidden transition-all duration-400"
              style={{
                width: chatOpen ? 0 : 14,
                opacity: chatOpen ? 0 : 1,
                marginRight: chatOpen ? 0 : 4,
              }}
            >
              <Sparkles size={14} />
            </div>
            Chat with trace
            <div
              className="overflow-hidden transition-all duration-400"
              style={{
                width: chatOpen ? 14 : 0,
                opacity: chatOpen ? 1 : 0,
                marginLeft: chatOpen ? 4 : 0,
              }}
            >
              <X size={14} />
            </div>
          </Button>
        </div>
        <div className="flex items-center gap-x-0.5 flex-shrink-0">
          <Metadata metadata={trace?.metadata} />
          {trace && <ShareTraceButton projectId={projectId} />}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {!chatOpen && <TraceViewSearch spans={spans} onSubmit={onSearch} className="flex-1" />}
      </div>
      {!chatOpen && (
        <CondensedTimelineControls enabled={condensedTimelineEnabled} setEnabled={setCondensedTimelineEnabled} />
      )}
      <OpenInDebuggerDialog open={open} onOpenChange={setOpen} trace={trace} />
    </div>
  );
};

export default memo(Header);
