import { Play } from "lucide-react";

import { SpanType } from "@/lib/traces/types";
import { SPAN_TYPE_TO_COLOR } from "@/lib/traces/utils";

// The condensed timeline with the session needle on it. Every bar is a span,
// coloured by type; the needle is where the recording is paused. Scrubbing the
// replay drags this needle, so the video and the trace share one clock.
const BARS = [
  { row: 0, left: 0, width: 98, type: SpanType.EXECUTOR },
  { row: 1, left: 3, width: 34, type: SpanType.TOOL },
  { row: 1, left: 41, width: 27, type: SpanType.TOOL },
  { row: 1, left: 72, width: 24, type: SpanType.TOOL },
  { row: 2, left: 8, width: 22, type: SpanType.LLM },
  { row: 2, left: 44, width: 31, type: SpanType.LLM },
  { row: 3, left: 12, width: 14, type: SpanType.DEFAULT },
  { row: 3, left: 48, width: 19, type: SpanType.DEFAULT },
  { row: 3, left: 79, width: 12, type: SpanType.EVENT },
  { row: 4, left: 50, width: 16, type: SpanType.LLM },
  { row: 5, left: 15, width: 20, type: SpanType.TOOL },
  { row: 5, left: 55, width: 11, type: SpanType.DEFAULT },
  { row: 6, left: 57, width: 25, type: SpanType.EXECUTOR },
  { row: 7, left: 60, width: 13, type: SpanType.LLM },
];

const ROW_H = 10;
const NEEDLE_LEFT = 52;

const ScreenRecordingB = () => (
  <div className="absolute inset-0 overflow-hidden pl-[22px]">
    <div className="flex items-center gap-2 pb-3 pr-5">
      <span className="inline-flex items-center gap-1 rounded border border-primary-400/60 px-1.5 py-[3px] text-[9px] text-primary-200">
        <Play className="size-2.5 fill-current" strokeWidth={0} />
        Media
      </span>
      <span className="font-mono text-[9px] text-foreground-500">00:11 / 00:31</span>
    </div>

    <div className="relative mr-5 h-[185px]">
      {/* Time markers, behind the bars. */}
      {[20, 40, 60, 80].map((left) => (
        <span key={left} className="absolute inset-y-0 w-px bg-surface-up" style={{ left: `${left}%` }} />
      ))}

      {BARS.map((bar, i) => (
        <span
          key={i}
          className="absolute rounded-xs"
          style={{
            left: `${bar.left}%`,
            width: `${bar.width}%`,
            top: bar.row * ROW_H,
            height: ROW_H - 2,
            backgroundColor: SPAN_TYPE_TO_COLOR[bar.type],
          }}
        />
      ))}

      {/* The session needle: the head sits above the bars, the line runs through. */}
      <span className="absolute inset-y-0 z-10" style={{ left: `${NEEDLE_LEFT}%` }}>
        <span className="absolute -top-[9px] left-0 flex size-[15px] -translate-x-1/2 items-center justify-center rounded-full bg-foreground-500">
          <Play className="size-2 fill-black text-black" strokeWidth={0} />
        </span>
        <span className="absolute bottom-0 top-1 w-px bg-foreground-500" />
      </span>
    </div>
  </div>
);

export default ScreenRecordingB;
