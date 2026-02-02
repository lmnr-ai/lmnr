import { TooltipPortal } from "@radix-ui/react-tooltip";
import { ChevronDown, ChevronsRight, ChevronUp, Maximize, Sparkles } from "lucide-react";
import NextLink from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import React, { memo, useCallback, useMemo, useState } from "react";

import { useTraceViewNavigation } from "@/components/traces/trace-view/navigation-context";
import TraceViewSearch from "@/components/traces/trace-view/search";
import CondensedTimelineControls from "@/components/traces/trace-view/timeline-toggle";
import { type TraceViewSpan, useTraceViewStoreContext } from "@/components/traces/trace-view/trace-view-store.tsx";
import { useOpenInSql } from "@/components/traces/trace-view/use-open-in-sql.tsx";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { type Filter } from "@/lib/actions/common/filters";
import { useToast } from "@/lib/hooks/use-toast";
import { cn } from "@/lib/utils";

import { TraceStatsShields } from "../../stats-shields";
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
  const { navigateDown, navigateUp } = useTraceViewNavigation();

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
      {/* Line 1: close, expand, down, up, trace, shield ... export */}
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
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button disabled={!trace} onClick={navigateDown} className="hover:bg-secondary px-1" variant="ghost">
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipPortal>
                  <TooltipContent className="flex items-center">
                    Navigate down (
                    <kbd className="inline-flex items-center justify-center w-3 h-3 text-xs font-medium text-muted-foreground bg-muted border border-border rounded-lg shadow-md">
                      j
                    </kbd>
                    )
                  </TooltipContent>
                </TooltipPortal>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button disabled={!trace} onClick={navigateUp} className="hover:bg-secondary px-1" variant="ghost">
                    <ChevronUp className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipPortal>
                  <TooltipContent className="flex items-center">
                    Navigate up (
                    <kbd className="inline-flex items-center justify-center w-3 h-3 text-xs font-medium text-muted-foreground bg-muted border border-border rounded-lg shadow-md">
                      k
                    </kbd>
                    )
                  </TooltipContent>
                </TooltipPortal>
              </Tooltip>
            </div>
          )}
          {trace && <span className="text-base font-medium ml-2 flex-shrink-0">Trace</span>}
          {trace && <TraceStatsShields className="ml-2 min-w-0 overflow-hidden" trace={trace} singlePill />}
        </div>
        <div className="flex items-center gap-x-0.5 flex-shrink-0">
          <Metadata metadata={trace?.metadata} />
          {/* Export dropdown */}
          {trace && (
            <ExportDropdown
              handleCopyTraceId={handleCopyTraceId}
              isSqlLoading={isSqlLoading}
              openInSql={openInSql}
              isVisibilityLoading={isVisibilityLoading}
              handleChangeVisibility={handleChangeVisibility}
              isPublic={isPublic}
              handleCopyLink={handleCopyLink}
              copiedLink={copiedLink}
            />
          )}
        </div>
      </div>

      {/* Ask AI + Search */}
      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={() => setChatOpen(!chatOpen)}
              variant="outline"
              size="icon"
              className={cn("h-8 w-8", {
                "border-primary text-primary": chatOpen,
              })}
            >
              <Sparkles size={16} />
            </Button>
          </TooltipTrigger>
          <TooltipPortal>
            <TooltipContent>Ask AI about your trace</TooltipContent>
          </TooltipPortal>
        </Tooltip>
        {!chatOpen && <TraceViewSearch spans={spans} onSubmit={onSearch} className="flex-1" />}
      </div>

      {/* Timeline toggle - absolutely positioned below search bar */}
      {!chatOpen && <CondensedTimelineControls />}
    </div>
  );
};

export default memo(Header);
