"use client";

import { ExternalLink, Loader, Sparkles, Zap } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { useLaminarAgentStore } from "@/components/laminar-agent/store";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useFeatureFlags } from "@/contexts/feature-flags-context";
import { Feature } from "@/lib/features/features";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface SignalEvent {
  id: string;
  signal_id: string;
  trace_id: string;
  name: string;
}

interface SignalsPillProps {
  traceId: string;
}

export default function SignalsPill({ traceId }: SignalsPillProps) {
  const params = useParams();
  const projectId = params?.projectId as string;
  const [events, setEvents] = useState<SignalEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const featureFlags = useFeatureFlags();
  const aiEnabled = featureFlags[Feature.LAMINAR_AGENT];

  const { setViewMode, setPrefillInput, viewMode } = useLaminarAgentStore((s) => ({
    setViewMode: s.setViewMode,
    setPrefillInput: s.setPrefillInput,
    viewMode: s.viewMode,
  }));

  useEffect(() => {
    let cancelled = false;

    const fetchSignalEvents = async () => {
      if (!UUID_REGEX.test(traceId)) {
        setIsLoading(false);
        setEvents([]);
        return;
      }

      try {
        setIsLoading(true);
        const response = await fetch(`/api/projects/${projectId}/sql`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: `SELECT id, signal_id, trace_id, name FROM signal_events WHERE trace_id = '${traceId}' ORDER BY timestamp DESC`,
          }),
        });
        if (!cancelled) {
          if (response.ok) {
            const results = (await response.json()) as SignalEvent[];
            setEvents(results);
          } else {
            setEvents([]);
          }
        }
      } catch {
        if (!cancelled) {
          setEvents([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchSignalEvents();

    return () => {
      cancelled = true;
    };
  }, [projectId, traceId]);

  const handleExplainSignal = useCallback(
    (event: SignalEvent) => {
      const prompt = `Show me the payload of this signal event ${event.id}, explain why it was detected on this trace ${traceId}, and detail which spans are relevant and why`;
      setPrefillInput(prompt);
      if (viewMode === "collapsed") {
        setViewMode("floating");
      }
    },
    [traceId, setPrefillInput, setViewMode, viewMode]
  );

  const handleOpenInSignals = useCallback(
    (event: SignalEvent) => {
      const url = `/project/${projectId}/signals/${event.signal_id}?eventId=${event.id}`;
      window.open(url, "_blank");
    },
    [projectId]
  );

  if (isLoading) {
    return (
      <Button variant="outline" className="h-6 text-xs px-1.5" disabled>
        <Loader className="size-3.5 animate-spin" />
        Signals
      </Button>
    );
  }

  if (events.length === 0) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="h-6 text-xs px-1.5 border-primary text-primary hover:bg-primary/10">
          <Zap size={14} />
          {events.length} {events.length === 1 ? "signal" : "signals"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {events.map((event) => (
          <DropdownMenuSub key={event.id}>
            <DropdownMenuSubTrigger className="text-xs">{event.name || event.id}</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {aiEnabled && (
                <DropdownMenuItem onClick={() => handleExplainSignal(event)} className="text-xs">
                  <Sparkles className="size-3.5" />
                  Explain signal with Laminar Agent
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => handleOpenInSignals(event)} className="text-xs">
                <ExternalLink className="size-3.5" />
                Open in Signals
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
