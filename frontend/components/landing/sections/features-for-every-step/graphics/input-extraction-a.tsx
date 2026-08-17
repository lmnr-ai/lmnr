// The prompt is buried four levels deep in the tree; Laminar lifts it to the
// top of the trace. The dashed rail is that lift.
const ROWS = [
  { depth: 0, name: "agent.run" },
  { depth: 1, name: "plan_task" },
  { depth: 2, name: "tool.delegate" },
  { depth: 3, name: "subagent.browse" },
  { depth: 4, name: "chat.completion", found: true },
  { depth: 4, name: "parse_offers" },
  { depth: 3, name: "tool.book" },
  { depth: 2, name: "verify_itinerary" },
];

const InputExtractionA = () => (
  <div className="absolute inset-x-0 top-0 bottom-0 overflow-hidden pl-5">
    <div className="rounded-tl border-t border-l border-surface-350 bg-surface-200 p-2.5 pr-5">
      <p className="text-[10px] text-foreground-500">Input</p>
      <p className="mt-1 text-[11px] leading-4 text-white">Book the cheapest direct flight to Tokyo in March.</p>
    </div>

    <div className="relative mt-2.5 flex flex-col gap-[3px]">
      {/* Rail from the lifted row back up into the Input panel. */}
      <div className="absolute -top-2.5 left-[5px] h-[102px] w-px border-l border-dashed border-primary-400/50" />
      {ROWS.map((row) => (
        <div
          key={row.name}
          style={{ marginLeft: row.depth * 13 + 14 }}
          className={
            row.found
              ? "flex items-center gap-1.5 rounded-sm bg-primary-400/10 px-1.5 py-1 text-[10px] text-primary-200"
              : "flex items-center gap-1.5 px-1.5 py-1 text-[10px] text-foreground-500"
          }
        >
          <span className="size-1 shrink-0 rounded-full bg-current opacity-60" />
          <span className="truncate font-mono">{row.name}</span>
        </div>
      ))}
    </div>
  </div>
);

export default InputExtractionA;
