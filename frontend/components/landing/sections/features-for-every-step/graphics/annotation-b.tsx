// Three sources funnel into one dataset. The braces are the funnel.
const SOURCES = ["Traces", "Spans", "SQL results"];

const ROWS = [
  { text: "Booked NRT, no return leg", label: "incomplete" },
  { text: "Cancelled the wrong leg", label: "wrong" },
  { text: "Confirmed before booking", label: "correct" },
  { text: "Retried after a gateway 504", label: "correct" },
];

const LABEL_TONE: Record<string, string> = {
  correct: "border-green-400/40 bg-green-400/10 text-green-300",
  incomplete: "border-surface-400 text-foreground-400",
  wrong: "border-surface-400 text-foreground-400",
};

const AnnotationB = () => (
  <div className="absolute inset-0 overflow-hidden pl-5">
    <div className="flex gap-1.5 pr-5">
      {SOURCES.map((source) => (
        <span
          key={source}
          className="flex-1 truncate rounded border border-surface-350 bg-surface-200 px-1.5 py-1 text-center text-[10px] text-foreground-400"
        >
          {source}
        </span>
      ))}
    </div>

    {/* The funnel: a drop from each source onto one rail, then down into the set. */}
    <div className="relative mr-5 h-4">
      <span className="absolute left-[16%] top-0 h-2 w-px bg-surface-450" />
      <span className="absolute left-1/2 top-0 h-2 w-px bg-surface-450" />
      <span className="absolute left-[84%] top-0 h-2 w-px bg-surface-450" />
      <span className="absolute left-[16%] top-2 h-px w-[68%] bg-surface-450" />
      <span className="absolute left-1/2 top-2 h-2 w-px bg-surface-450" />
    </div>

    <div className="rounded-tl border-t border-l border-surface-350 bg-surface-200">
      <div className="flex gap-2 border-b border-surface-350 px-3 py-1.5 text-[10px] text-foreground-500">
        <span className="flex-1">output</span>
        <span className="w-[64px] shrink-0">label</span>
      </div>
      {ROWS.map((row) => (
        <div key={row.text} className="flex items-center gap-2 border-b border-surface-300/60 px-3 py-2 last:border-0">
          <span className="min-w-0 flex-1 truncate text-[10px] text-foreground-200">{row.text}</span>
          <span
            className={`w-[64px] shrink-0 truncate rounded border px-1 py-[1px] text-center text-[9px] ${LABEL_TONE[row.label]}`}
          >
            {row.label}
          </span>
        </div>
      ))}
    </div>
  </div>
);

export default AnnotationB;
