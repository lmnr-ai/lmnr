"use client";

import { ChevronDown, Copy, Database, Loader } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback } from "react";

import { useSignalStoreContext } from "@/components/signal/store.tsx";
import { useOpenInSql } from "@/components/traces/trace-view/use-open-in-sql.tsx";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/lib/hooks/use-toast";

export default function SignalDropdown() {
  const params = useParams();
  const projectId = params?.projectId as string;
  const signal = useSignalStoreContext((state) => state.signal);
  const { toast } = useToast();
  const { openInSql, isLoading: isSqlLoading } = useOpenInSql({
    projectId,
    params: { type: "signal", signalId: signal.id, signalName: signal.name },
  });

  const handleCopySignalId = useCallback(async () => {
    if (!signal.id) return;
    try {
      await navigator.clipboard.writeText(signal.id);
      toast({ title: "Copied signal ID", duration: 1000 });
    } catch {
      toast({ variant: "destructive", title: "Failed to copy signal ID" });
    }
  }, [signal.id, toast]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-6 px-1 hover:bg-secondary">
          <ChevronDown className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onClick={handleCopySignalId}>
          <Copy size={14} />
          Copy signal ID
        </DropdownMenuItem>
        <DropdownMenuItem disabled={isSqlLoading} onClick={openInSql}>
          {isSqlLoading ? <Loader className="size-3.5 animate-spin" /> : <Database className="size-3.5" />}
          Open in SQL editor
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
