import { useParams } from "next/navigation";
import { useCallback } from "react";
import { toast } from "sonner";

import { useTraceViewStore } from "@/components/traces/trace-view/store";
import { useOpenInSql } from "@/components/traces/trace-view/use-open-in-sql.tsx";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Copy, Database, Loader } from "@/components/ui/icon-lib";

interface TraceDropdownProps {
  traceId: string;
}

export default function TraceDropdown({ traceId }: TraceDropdownProps) {
  const params = useParams();
  const projectId = params?.projectId as string;
  const trace = useTraceViewStore((state) => state.trace);
  const { openInSql, isLoading: isSqlLoading } = useOpenInSql({
    projectId,
    params: { type: "trace", traceId },
  });

  const handleCopyTraceId = useCallback(async () => {
    if (trace?.id) {
      await navigator.clipboard.writeText(trace.id);
      toast("Copied trace ID", { duration: 1000 });
    }
  }, [trace?.id]);

  const sessionId = trace?.sessionId;
  const hasSession = sessionId && sessionId !== "<null>" && sessionId !== "";

  const handleCopySessionId = useCallback(async () => {
    if (sessionId) {
      await navigator.clipboard.writeText(sessionId);
      toast("Copied session ID", { duration: 1000 });
    }
  }, [sessionId]);

  // TODO: add userId to TraceViewTrace to enable "Copy user ID"

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
        {hasSession && (
          <DropdownMenuItem onClick={handleCopySessionId}>
            <Copy size={14} />
            Copy session ID
          </DropdownMenuItem>
        )}
        {/* TODO: add userId to TraceViewTrace to enable "Copy user ID" */}
        <DropdownMenuItem disabled={isSqlLoading} onClick={openInSql}>
          {isSqlLoading ? <Loader className="size-3.5 animate-spin" /> : <Database className="size-3.5" />}
          Open in SQL editor
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
