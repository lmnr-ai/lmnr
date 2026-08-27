import { ArrowRight } from "lucide-react";

import SpanTypeIcon from "@/components/traces/span-type-icon";
import { SpanType } from "@/lib/traces/types";

// The transcript with the Input item leading, before a single model call — what
// "a trace opens on what was asked" looks like. `iconClassName` is REQUIRED:
// SpanTypeIcon defaults it to `w-4 h-4`, which beats the `size` prop and would
// pin every glyph to 16px, too big for these chips.
const CHIP = {
  containerWidth: 16,
  containerHeight: 16,
  size: 12,
  iconClassName: "size-3 [stroke-width:2.25]",
} as const;

const InputExtraction = () => (
  <div className="absolute inset-0 overflow-hidden">
    <div className="flex flex-col gap-1 bg-blue-400/5 py-2 pl-2.5 pr-2">
      <div className="flex items-center gap-2">
        <span className="flex size-4 shrink-0 items-center justify-center rounded bg-blue-400/70">
          <ArrowRight size={12} strokeWidth={2.25} className="text-white" />
        </span>
        <span className="text-[11px] font-medium text-white">Input</span>
      </div>
      <p className="pl-6 text-[11px] leading-4 text-foreground-200">
        Add rate limiting to the /v1/traces ingest route. Reject over-quota projects with a 429.
      </p>
    </div>

    <div className="mt-1 flex flex-col gap-1 py-2 pl-2.5 pr-2">
      <div className="flex items-center gap-2">
        <SpanTypeIcon spanType={SpanType.LLM} {...CHIP} />
        <span className="text-[11px] font-medium text-white">claude-opus-5</span>
      </div>
      <p className="pl-6 text-[11px] leading-4 text-foreground-400">
        I should add a token bucket keyed by project id, then check it in the handler before the batch is parsed.
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

export default InputExtraction;
