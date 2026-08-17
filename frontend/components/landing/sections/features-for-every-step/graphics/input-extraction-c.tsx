import { ArrowRight, Bot, ChevronRight } from "lucide-react";

// Every agent group, not just the top one. Each collapsed subagent header
// carries its own In row, so a nested delegation opens on the task IT was
// handed rather than on the run's original prompt.
const AGENTS = [
  { name: "travel-agent", task: "Book the cheapest direct flight to Tokyo", tokens: "48.2k", open: true },
  { name: "flight-search", task: "Compare fares across NRT and HND", tokens: "12.4k" },
  { name: "seat-picker", task: "Pick an aisle seat under 80,000 JPY", tokens: "6.1k" },
];

const InputExtractionC = () => (
  <div className="absolute inset-0 overflow-hidden pl-[22px]">
    <div className="flex flex-col gap-2 pr-4">
      {AGENTS.map((agent, i) => (
        <div key={agent.name} style={{ marginLeft: i * 10 }} className="rounded-lg border bg-surface-down/80 px-2 py-2">
          <div className="flex items-center gap-2">
            <span className="flex size-4 shrink-0 items-center justify-center rounded bg-subagent/70">
              <Bot size={11} className="text-black/80" />
            </span>
            <span className="truncate text-[11px] font-medium text-white">{agent.name}</span>
            <span className="ml-auto shrink-0 font-mono text-[9px] text-foreground-500">{agent.tokens}</span>
            <ChevronRight
              size={11}
              className={agent.open ? "shrink-0 rotate-90 text-foreground-500" : "shrink-0 text-foreground-500"}
            />
          </div>
          <div className="mt-1.5 flex items-start gap-1.5">
            <span className="mt-[1px] flex size-3.5 shrink-0 items-center justify-center rounded bg-blue-400/70">
              <ArrowRight size={9} className="text-black/80" />
            </span>
            <span className="shrink-0 text-[10px] text-foreground-500">In</span>
            <span className="min-w-0 flex-1 truncate text-[10px] text-foreground-200">{agent.task}</span>
          </div>
        </div>
      ))}
    </div>
  </div>
);

export default InputExtractionC;
