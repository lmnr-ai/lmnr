import { ArrowRight } from "lucide-react";

import SpanTypeIcon from "@/components/traces/span-type-icon";
import { SpanType } from "@/lib/traces/types";

// The transcript, as the trace view renders it: the Input item leads, in its
// blue tint behind the blue arrow chip, before a single model call is shown.
// That is what "a trace opens on what was asked" looks like on screen.
const InputExtractionB = () => (
  <div className="absolute inset-0 overflow-hidden pl-[22px]">
    <div className="flex flex-col gap-1 bg-blue-400/5 py-2 pl-1 pr-2">
      <div className="flex items-center gap-2">
        <span className="flex size-4 shrink-0 items-center justify-center rounded bg-blue-400/70">
          <ArrowRight size={11} className="text-black/80" />
        </span>
        <span className="text-[11px] font-medium text-white">Input</span>
      </div>
      <p className="pl-6 text-[11px] leading-4 text-foreground-200">
        Book the cheapest direct flight to Tokyo in March.
      </p>
    </div>

    <div className="mt-1 flex flex-col gap-1 py-2 pl-1 pr-2">
      <div className="flex items-center gap-2">
        <SpanTypeIcon spanType={SpanType.LLM} containerWidth={16} containerHeight={16} size={11} />
        <span className="text-[11px] font-medium text-white">Output</span>
      </div>
      <p className="pl-6 text-[11px] leading-4 text-foreground-400">Booked NRT on Mar 4, 09:40, one way, 68,400 JPY.</p>
    </div>

    <div className="mt-1 flex flex-col gap-1 py-2 pl-1 pr-2">
      <div className="flex items-center gap-2">
        <SpanTypeIcon spanType={SpanType.TOOL} containerWidth={16} containerHeight={16} size={11} />
        <span className="truncate text-[11px] text-foreground-300">book_seat</span>
      </div>
      <p className="truncate pl-6 text-[11px] leading-4 text-foreground-500">
        {'{ "flight": "NH106", "seat": "21A" }'}
      </p>
    </div>
  </div>
);

export default InputExtractionB;
