"use client";

import { ArrowLeftRight, ChevronDown, Copy, ExternalLink } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/lib/hooks/use-toast";
import { cn } from "@/lib/utils";

const TraceIdPill = ({
  traceId,
  projectId,
  onSelectAnother,
  selectAnotherDisabled,
  className,
}: {
  traceId: string;
  projectId: string;
  onSelectAnother: () => void;
  selectAnotherDisabled?: boolean;
  className?: string;
}) => {
  const { toast } = useToast();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/30 outline outline-white/20 hover:bg-secondary/80 transition-colors text-sm",
            className
          )}
        >
          {traceId}
          <ChevronDown className="size-3 text-secondary-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onSelectAnother} disabled={selectAnotherDisabled}>
          <ArrowLeftRight className="size-3.5" />
          Select another trace
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            navigator.clipboard.writeText(traceId);
            toast({ title: "Trace ID copied" });
          }}
        >
          <Copy className="size-3.5" />
          Copy trace ID
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            window.open(`/project/${projectId}/traces/${traceId}`, "_blank");
          }}
        >
          <ExternalLink className="size-3.5" />
          Open trace in new tab
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default TraceIdPill;
