import { Play } from "lucide-react";

import SpanTypeIcon from "@/components/traces/span-type-icon";
import { SpanType } from "@/lib/traces/types";

// Replay and span tree share `sessionTime`. Scrubbing the player selects the
// span that was running; selecting a span moves the player to it.
const SPANS = [
  { name: "goto(search)", type: SpanType.TOOL, at: "00:00" },
  { name: "click(offer)", type: SpanType.TOOL, at: "00:07" },
  { name: "chat.completion", type: SpanType.LLM, at: "00:11", active: true },
  { name: "fill(passenger)", type: SpanType.TOOL, at: "00:18" },
  { name: "verify_fare", type: SpanType.DEFAULT, at: "00:24" },
];

const ScreenRecordingC = () => (
  <div className="absolute inset-0 overflow-hidden pl-[22px]">
    <div className="rounded-tl border-t border-l border-surface-up-2 bg-surface-down">
      <div className="flex items-center gap-2 border-b border-surface-up-2 px-2.5 py-[7px]">
        <Play className="size-3 shrink-0 fill-current text-foreground-200" strokeWidth={0} />
        <span className="shrink-0 text-[10px] text-foreground-400">1x</span>
        <span className="relative h-[3px] flex-1 rounded-full bg-surface-up-3">
          <span className="absolute inset-y-0 left-0 w-[36%] rounded-full bg-white/70" />
          <span className="absolute -top-[2px] left-[36%] size-[7px] -translate-x-1/2 rounded-full bg-white" />
        </span>
        <span className="shrink-0 font-mono text-[9px] text-foreground-400">00:11/00:31</span>
      </div>
      <div className="relative flex gap-2 bg-surface-down-3 p-2.5">
        <div className="flex w-[42px] shrink-0 flex-col gap-1">
          <span className="h-1.5 w-full rounded-sm bg-surface-up" />
          <span className="h-1.5 w-[70%] rounded-sm bg-surface-up" />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <span className="h-2 w-[58%] rounded-sm bg-surface-up-3" />
          <div className="flex gap-1.5">
            <span className="h-7 flex-1 rounded-sm bg-surface-down" />
            <span className="h-7 flex-1 rounded-sm bg-surface-down" />
          </div>
        </div>
        {/* Click ripple where the selected span touched the page. */}
        <span className="absolute left-[118px] top-[38px] size-6 rounded-full border border-primary-400/50" />
        <span className="absolute left-[125px] top-[45px] size-2.5 rounded-full bg-primary-400/60" />
      </div>
    </div>

    <div className="mt-2.5 flex flex-col">
      {SPANS.map((span) => (
        <div
          key={span.name}
          className={
            span.active
              ? "flex items-center gap-2 rounded-l border-y border-l border-primary-400/30 bg-primary-400/[0.08] px-2 py-[5px]"
              : "flex items-center gap-2 px-2 py-[5px]"
          }
        >
          <SpanTypeIcon
            spanType={span.type}
            containerWidth={15}
            containerHeight={15}
            size={10}
            iconClassName="text-white"
          />
          <span
            className={
              span.active
                ? "min-w-0 flex-1 truncate text-[10px] text-white"
                : "min-w-0 flex-1 truncate text-[10px] text-foreground-400"
            }
          >
            {span.name}
          </span>
          <span className="shrink-0 font-mono text-[9px] text-foreground-600">{span.at}</span>
        </div>
      ))}
    </div>
  </div>
);

export default ScreenRecordingC;
