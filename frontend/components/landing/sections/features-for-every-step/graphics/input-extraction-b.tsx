import SpanTypeIcon from "@/components/traces/span-type-icon";
import { SpanType } from "@/lib/traces/types";

// The traces table, with its Root span and Input columns. Nothing here is an ID
// to decode: the list reads as a list of what each run was asked to do.
const TRACES = [
  { span: "agent.run", type: SpanType.EXECUTOR, task: "Book the cheapest direct flight", duration: "14.2s" },
  { span: "chat.completion", type: SpanType.LLM, task: "Refactor auth to use sessions", duration: "1m 04s" },
  { span: "agent.run", type: SpanType.EXECUTOR, task: "Summarise support threads", duration: "8.7s" },
  { span: "reconcile", type: SpanType.TOOL, task: "Match March invoices to Stripe", duration: "22.9s", error: true },
  { span: "agent.run", type: SpanType.EXECUTOR, task: "Draft release notes from PRs", duration: "11.4s" },
  { span: "chat.completion", type: SpanType.LLM, task: "Find customers on the old plan", duration: "6.1s" },
];

const InputExtractionB = () => (
  <div className="absolute inset-0 overflow-hidden pl-[22px]">
    <div className="rounded-tl border-t border-l border-surface-up-2 bg-surface-down">
      <div className="flex gap-2.5 border-b border-surface-up-2 px-2.5 py-1.5 text-[10px] text-foreground-500">
        <span className="w-[3px] shrink-0" />
        <span className="w-[74px] shrink-0">Root span</span>
        <span className="flex-1">Input</span>
        <span className="w-[46px] shrink-0 text-right">Duration</span>
      </div>
      {TRACES.map((trace) => (
        <div key={trace.task} className="flex items-center gap-2.5 border-b border-surface-up/60 px-2.5 py-[7px]">
          <span
            className={
              trace.error
                ? "h-4 w-[3px] shrink-0 rounded-[2px] bg-red-400/80"
                : "h-4 w-[3px] shrink-0 rounded-[2px] bg-green-400/80"
            }
          />
          <span className="flex w-[74px] shrink-0 items-center gap-1.5">
            <SpanTypeIcon
              spanType={trace.type}
              status={trace.error ? "error" : undefined}
              containerWidth={15}
              containerHeight={15}
              size={10}
              iconClassName="text-white"
            />
            <span className="truncate text-[10px] text-foreground-400">{trace.span}</span>
          </span>
          <span className="min-w-0 flex-1 truncate text-[10px] text-foreground-100">{trace.task}</span>
          <span className="w-[46px] shrink-0 text-right font-mono text-[10px] text-foreground-500">
            {trace.duration}
          </span>
        </div>
      ))}
    </div>
  </div>
);

export default InputExtractionB;
