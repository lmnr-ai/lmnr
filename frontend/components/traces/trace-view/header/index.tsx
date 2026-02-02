import { ChevronDown, ChevronsRight, Copy, Database, Loader, Maximize, Sparkles } from "lucide-react";
import NextLink from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { memo, useCallback, useMemo, useState } from "react";

import TraceViewSearch from "@/components/traces/trace-view/search";
import CondensedTimelineControls from "./timeline-toggle";
import { type TraceViewSpan, useTraceViewStoreContext } from "@/components/traces/trace-view/trace-view-store.tsx";
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
import { cn } from "@/lib/utils";

import Metadata from "../metadata";
import ExportDropdown from "./export-dropdown";

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

  const { trace, updateTraceVisibility } = useTraceViewStoreContext((state) => ({
    trace: state.trace,
    updateTraceVisibility: state.updateTraceVisibility,
  }));

  const { toast } = useToast();
  const { openInSql, isLoading: isSqlLoading } = useOpenInSql({
    projectId: projectId as string,
    params: { type: "trace", traceId: String(trace?.id) },
  });
  const [isVisibilityLoading, setIsVisibilityLoading] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const handleCopyTraceId = useCallback(async () => {
    if (trace?.id) {
      await navigator.clipboard.writeText(trace.id);
      toast({ title: "Copied trace ID", duration: 1000 });
    }
  }, [trace?.id, toast]);

  const handleCopyLink = useCallback(async () => {
    if (trace?.id) {
      const url = `${window.location.origin}/shared/traces/${trace.id}`;
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      toast({ title: "Copied link", duration: 1000 });
      setTimeout(() => setCopiedLink(false), 2000);
    }
  }, [trace?.id, toast]);

  const handleChangeVisibility = useCallback(
    async (value: "private" | "public") => {
      if (!trace?.id || trace.visibility === value) return;

      try {
        setIsVisibilityLoading(true);
        const res = await fetch(`/api/projects/${projectId}/traces/${trace.id}`, {
          method: "PUT",
          body: JSON.stringify({
            visibility: value,
          }),
        });

        if (res.ok) {
          toast({
            title: `Trace is now ${value}`,
            duration: 1000,
          });
          updateTraceVisibility(value);
        } else {
          const text = await res.json();
          if ("error" in text) {
            toast({ variant: "destructive", title: "Error", description: String(text.error) });
          }
        }
      } catch (e) {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to update trace visibility. Please try again.",
        });
      } finally {
        setIsVisibilityLoading(false);
      }
    },
    [trace?.id, trace?.visibility, projectId, toast, updateTraceVisibility]
  );

  const fullScreenParams = useMemo(() => {
    const ps = new URLSearchParams(searchParams);
    if (params.evaluationId) {
      ps.set("evaluationId", params.evaluationId as string);
    }
    return ps;
  }, [params.evaluationId, searchParams]);

  const isPublic = trace?.visibility === "public";

  return (
    <div className="relative flex flex-col gap-1.5 px-2 pt-1.5 pb-2">
      {/* Line 1: Close, Expand, Trace + chevron dropdown, Ask AI, Metadata, Export */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center min-w-0">
          {!params?.traceId && (
            <div className="flex items-center flex-shrink-0">
              <Button variant="ghost" className="px-1" onClick={handleClose}>
                <ChevronsRight className="w-5 h-5" />
              </Button>
              {trace && (
                <NextLink passHref href={`/project/${projectId}/traces/${trace?.id}?${fullScreenParams.toString()}`}>
                  <Button variant="ghost" className="px-1">
                    <Maximize className="w-4 h-4" />
                  </Button>
                </NextLink>
              )}
            </div>
          )}
          {trace && <span className="text-base font-medium ml-2 flex-shrink-0">Trace</span>}
          {/* Chevron dropdown (Copy trace ID, Open in SQL) */}
          {trace && (
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
          )}
          {/* Ask AI button */}
          <Button
            onClick={() => setChatOpen(!chatOpen)}
            variant="outline"
            className="h-6 text-xs px-1.5 border-primary text-primary hover:bg-primary/10"
          >
            <Sparkles size={14} className="mr-1" />
            Ask AI
          </Button>
        </div>
        <div className="flex items-center gap-x-0.5 flex-shrink-0">
          <Metadata metadata={trace?.metadata} />
          {/* Export dropdown */}
          {trace && (
            <ExportDropdown
              isVisibilityLoading={isVisibilityLoading}
              handleChangeVisibility={handleChangeVisibility}
              isPublic={isPublic}
              handleCopyLink={handleCopyLink}
              copiedLink={copiedLink}
            />
          )}
        </div>
      </div>

      {/* Line 2: Search only */}
      <div className="flex items-center gap-2">
        {!chatOpen && <TraceViewSearch spans={spans} onSubmit={onSearch} className="flex-1" />}
      </div>

      {/* Line 3: Timeline toggle */}
      {!chatOpen && <CondensedTimelineControls />}
    </div>
  );
};

export default memo(Header);
