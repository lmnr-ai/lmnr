"use client";

import { RotateCcw } from "lucide-react";
import { type CSSProperties } from "react";

import AnimatedConnector from "@/components/onboarding/steps/signals-step/pipeline-diagram/animated-connector";
import ClusterList, {
  CLASSIFIED_EVENT_COUNT,
} from "@/components/onboarding/steps/signals-step/pipeline-diagram/cluster-list";
import PipelineNode from "@/components/onboarding/steps/signals-step/pipeline-diagram/pipeline-node";
import {
  arrivalCount,
  arrivalProgress,
  CONNECTORS,
  itemReveal,
  NODE_GROW_AT,
  END_TIME,
} from "@/components/onboarding/steps/signals-step/pipeline-diagram/timeline";
import { useFitScale } from "@/components/onboarding/steps/signals-step/pipeline-diagram/use-fit-scale";
import { usePlaybackTime } from "@/components/onboarding/steps/signals-step/pipeline-diagram/use-playback-time";
import WarningIcon from "@/components/onboarding/steps/signals-step/pipeline-diagram/warning-icon";
import { cn } from "@/lib/utils";

const TRACE_COUNT = 75;
const EVENT_COUNT = 18;

const CIRCLE_SIZE = 44;
const BOX_HEIGHT = 120;
// Nodes + padding + connectors at their min width; narrower containers zoom the whole diagram out.
const DIAGRAM_MIN_WIDTH = 464;

const pop = (reveal: number): CSSProperties => ({ opacity: reveal, transform: `scale(${reveal})` });

function ProcessCircle({ className }: { className?: string }) {
  return (
    <div className={cn("flex size-11 items-center justify-center rounded-full", className)}>
      <svg
        viewBox="0 0 30 30"
        className="size-7 animate-[spin_1.2s_linear_infinite] motion-reduce:animate-none"
        fill="none"
        aria-hidden
      >
        <path
          d="M29 15C29 7.27 22.73 1 15 1C7.27 1 1 7.27 1 15C1 22.73 7.27 29 15 29C16.81 29 18.55 28.65 20.14 28.03"
          className="stroke-[#161617]"
          strokeWidth="2"
        />
      </svg>
    </div>
  );
}

export default function PipelineDiagram() {
  const { time, replay } = usePlaybackTime(END_TIME);
  const { ref, scale } = useFitScale<HTMLDivElement>(DIAGRAM_MIN_WIDTH);
  const traces = arrivalCount(time, CONNECTORS.agentToTraces, TRACE_COUNT);
  const events = arrivalCount(time, CONNECTORS.signalToEvents, EVENT_COUNT);
  const clusters = arrivalProgress(time, CONNECTORS.eventsToClusters, CLASSIFIED_EVENT_COUNT);

  return (
    <div className="relative bg-surface-400">
      {/* Below sm the zoomed diagram spans edge to edge; extra room keeps the replay button off the nodes. */}
      <div ref={ref} className="overflow-hidden max-sm:pb-6">
        <div
          className="flex items-center justify-center px-3 pt-12 pb-8"
          style={{ minWidth: DIAGRAM_MIN_WIDTH, zoom: scale }}
          aria-hidden
        >
          <PipelineNode
            label="Your agent"
            time={time}
            growAt={NODE_GROW_AT.agent}
            width={CIRCLE_SIZE}
            height={CIRCLE_SIZE}
          >
            <ProcessCircle className="bg-[#f0f0f0]" />
          </PipelineNode>
          <AnimatedConnector time={time} timing={CONNECTORS.agentToTraces} />
          <PipelineNode label="Traces" time={time} growAt={NODE_GROW_AT.traces} width={100} height={BOX_HEIGHT}>
            <div className="flex h-30 w-25 flex-wrap content-start gap-1.5 bg-surface-550 p-2">
              {Array.from({ length: TRACE_COUNT }).map((_, i) => (
                <div key={i} className="size-1 rounded-full bg-foreground-400" style={pop(itemReveal(traces, i))} />
              ))}
            </div>
          </PipelineNode>
          <AnimatedConnector time={time} timing={CONNECTORS.tracesToSignal} />
          <PipelineNode
            label="flow-1"
            time={time}
            growAt={NODE_GROW_AT.signal}
            width={CIRCLE_SIZE}
            height={CIRCLE_SIZE}
          >
            <ProcessCircle className="bg-[#8cb9ff]" />
          </PipelineNode>
          <AnimatedConnector time={time} timing={CONNECTORS.signalToEvents} />
          <PipelineNode label="Events" time={time} growAt={NODE_GROW_AT.events} width={100} height={BOX_HEIGHT}>
            <div className="flex h-30 w-25 flex-wrap content-start gap-2 bg-surface-550 p-2">
              {Array.from({ length: EVENT_COUNT }).map((_, i) => (
                <WarningIcon key={i} className="text-foreground-500" style={pop(itemReveal(events, i))} />
              ))}
            </div>
          </PipelineNode>
          <AnimatedConnector time={time} timing={CONNECTORS.eventsToClusters} />
          <PipelineNode label="Clusters" time={time} growAt={NODE_GROW_AT.clusters} width={56} height={BOX_HEIGHT}>
            <ClusterList classified={clusters} />
          </PipelineNode>
        </div>
      </div>
      {time >= END_TIME && (
        <button
          type="button"
          onClick={replay}
          aria-label="Replay animation"
          className="absolute right-3 bottom-3 flex size-8 items-center justify-center rounded-full bg-surface-500 text-foreground-400 transition-colors animate-in fade-in duration-200 hover:overlay-hover active:overlay-selected"
        >
          <RotateCcw className="size-4" strokeWidth={1.5} />
        </button>
      )}
    </div>
  );
}
