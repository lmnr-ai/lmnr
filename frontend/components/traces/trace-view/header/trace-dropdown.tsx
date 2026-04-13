import { ChevronDown, Copy, Database, Layers, Loader } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback } from "react";

import { useTraceViewStore } from "@/components/traces/trace-view/store";
import { useOpenInSql } from "@/components/traces/trace-view/use-open-in-sql.tsx";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/lib/hooks/use-toast";

interface TraceDropdownProps {
  traceId: string;
}

export default function TraceDropdown({ traceId }: TraceDropdownProps) {
  const params = useParams();
  const projectId = params?.projectId as string;
  const trace = useTraceViewStore((state) => state.trace);
  const { toast } = useToast();
  const { openInSql, isLoading: isSqlLoading } = useOpenInSql({
    projectId,
    params: { type: "trace", traceId },
  });

  const handleCopyTraceId = useCallback(async () => {
    if (trace?.id) {
      await navigator.clipboard.writeText(trace.id);
      toast({ title: "Copied trace ID", duration: 1000 });
    }
  }, [trace?.id, toast]);

  const sessionId = trace?.sessionId;
  const hasSession = sessionId && sessionId !== "<null>" && sessionId !== "";

  const handleOpenSession = useCallback(() => {
    if (!hasSession || !trace) return;
    const filter = JSON.stringify({ column: "session_id", value: sessionId, operator: "eq" });
    const startDate = new Date(new Date(trace.startTime).getTime() - 3600_000).toISOString();
    const endDate = new Date(new Date(trace.endTime).getTime() + 3600_000).toISOString();
    const params = new URLSearchParams();
    params.set("view", "sessions");
    params.set("filter", filter);
    params.set("startDate", startDate);
    params.set("endDate", endDate);
    window.open(`/project/${projectId}/traces?${params.toString()}`, "_blank");
  }, [hasSession, trace, sessionId, projectId]);

  return (
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
        {hasSession && (
          <DropdownMenuItem onClick={handleOpenSession}>
            <Layers size={14} />
            Open session
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
