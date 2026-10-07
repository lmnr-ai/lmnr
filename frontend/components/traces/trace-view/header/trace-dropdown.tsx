import { ChevronDown, Copy, Database, Loader } from "lucide-react";
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

  const handleCopySessionId = useCallback(async () => {
    if (sessionId) {
      await navigator.clipboard.writeText(sessionId);
      toast({ title: "Copied session ID", duration: 1000 });
    }
  }, [sessionId, toast]);

  const userId = trace?.userId;
  const hasUser = userId && userId !== "<null>" && userId !== "";

  const handleCopyUserId = useCallback(async () => {
    if (userId) {
      await navigator.clipboard.writeText(userId);
      toast({ title: "Copied user ID", duration: 1000 });
    }
  }, [userId, toast]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button aria-label="Trace actions" variant="ghost" className="gap-1 text-base font-medium hover:bg-surface-up">
          Trace
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
        {hasUser && (
          <DropdownMenuItem onClick={handleCopyUserId}>
            <Copy size={14} />
            Copy user ID
          </DropdownMenuItem>
        )}
        <DropdownMenuItem disabled={isSqlLoading} onClick={openInSql}>
          {isSqlLoading ? <Loader className="size-3.5 animate-spin" /> : <Database className="size-3.5" />}
          Open in SQL editor
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
