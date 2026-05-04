"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight } from "lucide-react";

import { type TraceSignal } from "@/components/traces/trace-view/store/base";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import ClusterBreadcrumb from "./cluster-breadcrumb";
import ExpandedContent from "./expanded-content";
import { getSignalDisplayColor } from "./utils";

interface Props {
  traceId: string;
  signal: TraceSignal;
  expanded: boolean;
  onToggle: () => void;
}

export default function SignalRow({ traceId, signal, expanded, onToggle }: Props) {
  // Tint shares the same hue as the outer panel border for the expanded row
  // (just lower opacity) so they read as the same color family. Unclustered
  // signals get blue-400 as a base hue rather than no color at all.
  const tintBg = `${getSignalDisplayColor(signal)}0d`;
  const fullBreadcrumb = [signal.signalName, ...signal.clusterPath.map((n) => n.name)].join(" / ");

  return (
    <div className="border-b border-border last:border-b-0">
      <TooltipProvider delayDuration={400}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onToggle}
              className="w-full flex items-center justify-between gap-2 pl-4 pr-2 py-2 hover:bg-muted/40 transition-colors text-left"
            >
              <div className="flex-1 min-w-0">
                <ClusterBreadcrumb signalName={signal.signalName} clusterPath={signal.clusterPath} />
              </div>
              <ChevronRight
                className={cn("size-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-90")}
              />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" align="start" className="max-w-md break-words">
            {fullBreadcrumb}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="expanded"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="overflow-hidden border-t border-border"
            style={{ backgroundColor: tintBg }}
          >
            <ExpandedContent traceId={traceId} signal={signal} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
