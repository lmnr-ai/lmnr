import { ArrowRight } from "lucide-react";

import SpanTypeIcon from "@/components/traces/span-type-icon";
import { SpanType } from "@/lib/traces/types";

// The transcript, as the trace view renders it: the Input item leads, in its
// blue tint behind the blue arrow chip, before a single model call is shown.
// That is what "a trace opens on what was asked" looks like on screen.
//
// Icons run smaller than their chips here than they do in the product: at this
// scale the product's ratio reads as a glyph jammed into a box.
const CHIP = { containerWidth: 16, containerHeight: 16, size: 9 } as const;

const InputExtractionA = () => (
  <div className="absolute inset-0 overflow-hidden pl-[22px]">
    <div className="flex flex-col gap-1 bg-blue-400/5 py-2 pl-2.5 pr-2">
      <div className="flex items-center gap-2">
        <span className="flex size-4 shrink-0 items-center justify-center rounded bg-blue-400/70">
          <ArrowRight size={9} className="text-white" />
        </span>
        <span className="text-[11px] font-medium text-white">Input</span>
      </div>
      <p className="pl-6 text-[11px] leading-4 text-foreground-200">
        Add rate limiting to the /v1/traces ingest route.
      </p>
    </div>

    <div className="mt-1 flex flex-col gap-1 py-2 pl-2.5 pr-2">
      <div className="flex items-center gap-2">
        <SpanTypeIcon spanType={SpanType.LLM} {...CHIP} />
        <span className="text-[11px] font-medium text-white">claude-opus-5</span>
      </div>
      <p className="pl-6 text-[11px] leading-4 text-foreground-400">
        Added a token bucket keyed by project, 600 req/min.
      </p>
    </div>

    <div className="mt-1 flex flex-col gap-1 py-2 pl-2.5 pr-2">
      <div className="flex items-center gap-2">
        <SpanTypeIcon spanType={SpanType.TOOL} {...CHIP} />
        <span className="truncate text-[11px] text-foreground-300">edit_file</span>
      </div>
      <p className="truncate pl-6 text-[11px] leading-4 text-foreground-500">{'{ "path": "src/routes/traces.rs" }'}</p>
    </div>
  </div>
);

export default InputExtractionA;
