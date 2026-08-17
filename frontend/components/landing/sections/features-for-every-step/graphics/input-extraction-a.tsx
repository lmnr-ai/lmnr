import SpanTypeIcon from "@/components/traces/span-type-icon";
import { SpanType } from "@/lib/traces/types";

// The trace view's own span tree. The task the run was given sits four levels
// down in an LLM call; `agent_input` lifts it to the top of the trace.
const ROWS = [
  { depth: 0, name: "agent.run", type: SpanType.EXECUTOR },
  { depth: 1, name: "plan_task", type: SpanType.LLM },
  { depth: 2, name: "delegate", type: SpanType.TOOL },
  { depth: 3, name: "browse_flights", type: SpanType.EXECUTOR },
  { depth: 4, name: "chat.completion", type: SpanType.LLM, found: true },
  { depth: 4, name: "parse_offers", type: SpanType.DEFAULT },
  { depth: 3, name: "book_seat", type: SpanType.TOOL },
];

const InputExtractionA = () => (
  <div className="absolute inset-0 overflow-hidden pl-[22px]">
    <div className="rounded-tl border-t border-l border-surface-up-2 bg-surface-down p-2.5 pr-5">
      <p className="text-[10px] text-foreground-500">agent_input</p>
      <p className="mt-1 text-[11px] leading-4 text-white">Book the cheapest direct flight to Tokyo in March.</p>
    </div>

    <div className="relative mt-3 flex flex-col">
      {/* The lift: from the span that held the prompt up into agent_input. */}
      <div className="absolute -top-3 left-[7px] h-[122px] w-px border-l border-dashed border-primary-400/50" />
      {ROWS.map((row) => (
        <div key={row.name} className="flex items-center gap-1.5 py-[3px]" style={{ paddingLeft: row.depth * 12 + 14 }}>
          <SpanTypeIcon
            spanType={row.type}
            containerWidth={15}
            containerHeight={15}
            size={10}
            iconClassName="text-white"
          />
          <span className={row.found ? "truncate text-[10px] text-white" : "truncate text-[10px] text-foreground-400"}>
            {row.name}
          </span>
        </div>
      ))}
    </div>
  </div>
);

export default InputExtractionA;
