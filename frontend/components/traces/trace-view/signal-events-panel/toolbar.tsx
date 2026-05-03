"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ExternalLink, Sparkles } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { useTraceViewStore } from "@/components/traces/trace-view/store";
import { type TraceSignal } from "@/components/traces/trace-view/store/base";
import { Button } from "@/components/ui/button";
import { type EventRow } from "@/lib/events/types";

import { usePanelHover } from "./hover-context";

interface Props {
  signal: TraceSignal;
}

/**
 * Action toolbar for a signal — sits OUTSIDE the scrollable tab content so
 * it stays pinned at the top of the popover regardless of scroll position.
 * Slides in/out (height animation) when the panel hover state toggles.
 */
export default function Toolbar({ signal }: Props) {
  const { projectId } = useParams();
  const openSignalInChat = useTraceViewStore((state) => state.openSignalInChat);
  const hovered = usePanelHover();

  const events = (signal.events as EventRow[]) ?? [];
  const latestEvent = events[0];

  const handleOpenInChat = () => {
    const signalDefinition = `### ${signal.signalName}\n${signal.prompt}`;
    const eventPayload = latestEvent ? latestEvent.payload : "No events found";
    openSignalInChat(signalDefinition, eventPayload);
  };

  return (
    <AnimatePresence initial={false}>
      {hovered && (
        <motion.div
          key="signal-tab-toolbar"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="overflow-hidden shrink-0"
        >
          <div className="flex items-center gap-1 pt-1.5 pb-1.5">
            <Button
              variant="outline"
              className="h-6 px-1.5 text-xs bg-transparent border-border hover:bg-muted text-secondary-foreground"
              onClick={handleOpenInChat}
            >
              <Sparkles className="size-3.5 mr-1" />
              Open in AI Chat
            </Button>
            <Button
              variant="outline"
              className="h-6 px-1.5 text-xs bg-transparent border-border hover:bg-muted text-secondary-foreground"
              asChild
            >
              <Link
                href={`/project/${projectId}/signals/${signal.signalId}?traceId=${signal.signalId}`}
                target="_blank"
              >
                <ExternalLink className="size-3.5 mr-1" />
                Open in Signals
              </Link>
            </Button>
            {latestEvent && (
              <Button
                variant="outline"
                className="h-6 px-1.5 text-xs bg-transparent border-border hover:bg-muted text-secondary-foreground"
                asChild
              >
                <Link
                  href={`/project/${projectId}/signals/${signal.signalId}?eventCluster=${latestEvent.id}`}
                  target="_blank"
                >
                  <ExternalLink className="size-3.5 mr-1" />
                  View similar events
                </Link>
              </Button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
