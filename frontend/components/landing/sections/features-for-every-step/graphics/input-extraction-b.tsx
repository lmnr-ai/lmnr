// The traces table with the task in the first column. No trace IDs to decode:
// the list reads as a list of what was asked.
const TRACES = [
  { task: "Book the cheapest direct flight to Tokyo", duration: "14.2s", ok: true },
  { task: "Refactor the auth module to use sessions", duration: "1m 04s", ok: true },
  { task: "Summarise yesterday's support threads", duration: "8.7s", ok: true },
  { task: "Reconcile the March invoices with Stripe", duration: "22.9s", ok: false },
  { task: "Draft release notes from the merged PRs", duration: "11.4s", ok: true },
  { task: "Find every customer on the legacy plan", duration: "6.1s", ok: true },
];

const InputExtractionB = () => (
  <div className="absolute inset-0 overflow-hidden pl-5">
    <div className="rounded-tl border-t border-l border-surface-350 bg-surface-200">
      <div className="flex gap-3 border-b border-surface-350 px-3 py-1.5 text-[10px] text-foreground-500">
        <span className="flex-1">Input</span>
        <span className="w-[52px] shrink-0 text-right">Duration</span>
      </div>
      {TRACES.map((trace) => (
        <div
          key={trace.task}
          className="flex items-center gap-3 border-b border-surface-300/60 px-3 py-2 last:border-0"
        >
          <span
            className={
              trace.ok
                ? "size-1.5 shrink-0 rounded-full bg-green-400/70"
                : "size-1.5 shrink-0 rounded-full bg-red-400/70"
            }
          />
          <span className="min-w-0 flex-1 truncate text-[11px] text-foreground-200">{trace.task}</span>
          <span className="w-[52px] shrink-0 text-right font-mono text-[10px] text-foreground-500">
            {trace.duration}
          </span>
        </div>
      ))}
    </div>
  </div>
);

export default InputExtractionB;
