import { type PropsWithChildren } from "react";

import {
  clamp01,
  GROW_DURATION,
  stageProgress,
} from "@/components/onboarding/steps/signals-step/pipeline-diagram/timeline";

const LABEL_REVEAL_FROM = 0.9;

interface PipelineNodeProps {
  label: string;
  time: number;
  growAt: number;
  width: number;
  height: number;
}

// Grows from its vertical centre; the label waits until the container is fully there.
// Label is absolutely positioned so connectors stay centred on the node, not on node + label.
export default function PipelineNode({
  label,
  time,
  growAt,
  width,
  height,
  children,
}: PropsWithChildren<PipelineNodeProps>) {
  const reveal = stageProgress(time, growAt, GROW_DURATION);
  // Ease-out looks finished well before the nominal duration; key off the visible height instead.
  const labelOpacity = clamp01((reveal - LABEL_REVEAL_FROM) / (1 - LABEL_REVEAL_FROM));

  return (
    <div className="relative shrink-0 flex items-center justify-center" style={{ width, height }}>
      {labelOpacity > 0 && (
        <span
          className="absolute bottom-full mb-2 text-xs text-white whitespace-nowrap"
          style={{ opacity: labelOpacity }}
        >
          {label}
        </span>
      )}
      <div className="relative overflow-hidden" style={{ width, height: height * reveal }}>
        <div className="absolute left-0 top-1/2 -translate-y-1/2" style={{ width, height }}>
          {children}
        </div>
      </div>
    </div>
  );
}
