import { ChevronDown, ChevronsRight, Copy, Maximize } from "lucide-react";
import Link from "next/link";
import { memo, useCallback } from "react";

import CondensedTimelineControls from "@/components/traces/trace-view/header/timeline-toggle";
import Metadata from "@/components/traces/trace-view/metadata";
import { useTraceViewStore } from "@/components/traces/trace-view/store";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/lib/hooks/use-toast";
import { cn } from "@/lib/utils";

interface HeaderProps {
  onClose?: () => void;
}

const Header = ({ onClose }: HeaderProps) => {
  const { trace, condensedTimelineEnabled, setCondensedTimelineEnabled } = useTraceViewStore((state) => ({
    trace: state.trace,
    condensedTimelineEnabled: state.condensedTimelineEnabled,
    setCondensedTimelineEnabled: state.setCondensedTimelineEnabled,
  }));

  const { toast } = useToast();

  const handleCopyTraceId = useCallback(async () => {
    if (trace?.id) {
      await navigator.clipboard.writeText(trace.id);
      toast({ title: "Copied trace ID", duration: 1000 });
    }
  }, [trace?.id, toast]);

  if (!onClose) {
    return (
      <div className="relative h-0">
        <CondensedTimelineControls
          enabled={condensedTimelineEnabled}
          setEnabled={setCondensedTimelineEnabled}
          className={cn(condensedTimelineEnabled ? "top-full" : "top-[calc(100%+8px)]")}
        />
      </div>
    );
  }

  return (
    <div className="relative flex flex-col gap-1.5 px-2 pt-1.5 pb-1">
      {/* Line 1: Close, Expand, Trace + chevron dropdown, Metadata */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center min-w-0 gap-2">
          <div className="flex items-center flex-shrink-0 gap-0.5">
            <Button variant="ghost" className="px-0.5" onClick={onClose}>
              <ChevronsRight className="w-5 h-5" />
            </Button>
            {trace && (
              <Link passHref href={`/shared/traces/${trace.id}`}>
                <Button variant="ghost" className="px-0.5">
                  <Maximize className="w-4 h-4" />
                </Button>
              </Link>
            )}
          </div>
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
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
        <div className="flex items-center gap-x-0.5 flex-shrink-0">
          <Metadata metadata={trace?.metadata} />
        </div>
      </div>

      {/* Timeline toggle */}
      <CondensedTimelineControls enabled={condensedTimelineEnabled} setEnabled={setCondensedTimelineEnabled} />
    </div>
  );
};

export default memo(Header);
