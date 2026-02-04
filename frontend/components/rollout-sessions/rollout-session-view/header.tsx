import { ChevronDown, Copy, Database, Loader } from "lucide-react";
import { useParams } from "next/navigation";
import React, { memo, useCallback } from "react";

import CondensedTimelineControls from "@/components/traces/trace-view/header/timeline-toggle";
import { useRolloutSessionStoreContext } from "@/components/rollout-sessions/rollout-session-view/rollout-session-store";
import Metadata from "@/components/traces/trace-view/metadata";
import TraceViewSearch from "@/components/traces/trace-view/search";
import { type TraceViewSpan } from "@/components/traces/trace-view/trace-view-store.tsx";
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

interface HeaderProps {
  spans: TraceViewSpan[];
  onSearch: (filters: Filter[], search: string) => void;
}

const Header = ({ spans, onSearch }: HeaderProps) => {
  const params = useParams();
  const projectId = params?.projectId as string;
  const { trace, condensedTimelineEnabled, setCondensedTimelineEnabled } = useRolloutSessionStoreContext((state) => ({
    trace: state.trace,
    condensedTimelineEnabled: state.condensedTimelineEnabled,
    setCondensedTimelineEnabled: state.setCondensedTimelineEnabled,
  }));

  const { toast } = useToast();
  const { openInSql, isLoading } = useOpenInSql({
    projectId: projectId as string,
    params: { type: "trace", traceId: String(trace?.id) },
  });

  const handleCopyTraceId = useCallback(async () => {
    if (trace?.id) {
      await navigator.clipboard.writeText(trace.id);
      toast({ title: "Copied trace ID", duration: 1000 });
    }
  }, [trace?.id, toast]);

  return (
    <div className="relative flex flex-col gap-1.5 px-2 pt-1.5 pb-2">
      {/* Line 1: Trace + chevron dropdown, Metadata */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center min-w-0 gap-2">
          {/* Chevron dropdown (Copy trace ID, Open in SQL) */}
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
                  <DropdownMenuItem disabled={isLoading} onClick={openInSql}>
                    {isLoading ? <Loader className="size-3.5 animate-spin" /> : <Database className="size-3.5" />}
                    Open in SQL editor
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
        <div className="flex items-center gap-x-0.5 flex-shrink-0">
          <Metadata metadata={trace?.metadata} />
        </div>
      </div>

      {/* Line 2: Search only */}
      <div className="flex items-center gap-2">
        <TraceViewSearch spans={spans} onSubmit={onSearch} className="flex-1" />
      </div>

      {/* Line 3: Timeline toggle */}
      <CondensedTimelineControls enabled={condensedTimelineEnabled} setEnabled={setCondensedTimelineEnabled} />
    </div>
  );
};

export default memo(Header);
