import { Play } from "lucide-react";

import SpanTypeIcon from "@/components/traces/span-type-icon";
import { SpanType } from "@/lib/traces/types";

// How the panel actually opens: Media splits the trace panel, transcript on the
// left, replay on the right, with the resize handle between them. The URL above
// the replay is the page the run was on at that moment.
const SPANS = [
  { name: "goto(search)", type: SpanType.TOOL },
  { name: "click(offer)", type: SpanType.TOOL },
  { name: "chat.completion", type: SpanType.LLM, active: true },
  { name: "fill(passenger)", type: SpanType.TOOL },
  { name: "verify_fare", type: SpanType.DEFAULT },
  { name: "click(confirm)", type: SpanType.TOOL },
  { name: "read_receipt", type: SpanType.DEFAULT },
  { name: "chat.completion", type: SpanType.LLM },
];

const ScreenRecordingC = () => (
  <div className="absolute inset-0 overflow-hidden pl-[22px]">
    <div className="flex h-full gap-0">
      <div className="flex w-[46%] shrink-0 flex-col gap-px pr-2">
        {SPANS.map((span) => (
          <div
            key={span.name}
            className={
              span.active
                ? "flex items-center gap-1.5 rounded-sm bg-primary-400/[0.08] px-1 py-[5px]"
                : "flex items-center gap-1.5 px-1 py-[5px]"
            }
          >
            <SpanTypeIcon spanType={span.type} containerWidth={14} containerHeight={14} size={9} />
            <span
              className={
                span.active
                  ? "min-w-0 flex-1 truncate text-[10px] text-white"
                  : "min-w-0 flex-1 truncate text-[10px] text-foreground-400"
              }
            >
              {span.name}
            </span>
          </div>
        ))}
      </div>

      {/* The resize handle between the two panels. */}
      <span className="w-px shrink-0 bg-surface-up-2" />

      <div className="min-w-0 flex-1 pl-2">
        <div className="rounded-tl border-t border-l border-surface-up-2 bg-surface-down">
          <div className="flex items-center gap-1.5 border-b border-surface-up-2 px-1.5 py-[5px]">
            <Play className="size-2.5 shrink-0 fill-current text-foreground-200" strokeWidth={0} />
            <span className="relative h-[3px] flex-1 rounded-full bg-surface-up-3">
              <span className="absolute inset-y-0 left-0 w-[36%] rounded-full bg-white/70" />
              <span className="absolute -top-[2px] left-[36%] size-[6px] -translate-x-1/2 rounded-full bg-white" />
            </span>
          </div>
          <p className="truncate border-b border-surface-up-2 px-1.5 py-1 font-mono text-[8px] text-foreground-500">
            flights.example.com/offer/48
          </p>
          <div className="flex flex-col gap-1 bg-surface-down-3 p-1.5">
            <span className="h-1.5 w-[70%] rounded-sm bg-surface-up-3" />
            <span className="h-1.5 w-[92%] rounded-sm bg-surface-up" />
            <div className="flex gap-1">
              <span className="h-6 flex-1 rounded-sm bg-surface-down" />
              <span className="h-6 flex-1 rounded-sm bg-surface-down" />
            </div>
            <span className="h-3 w-[44px] rounded-sm bg-primary-400/35" />
            <span className="h-1.5 w-[64%] rounded-sm bg-surface-up" />
          </div>
        </div>
      </div>
    </div>
  </div>
);

export default ScreenRecordingC;
