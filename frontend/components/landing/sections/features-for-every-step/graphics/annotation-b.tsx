import { Database } from "lucide-react";

// Three places you can add to a queue, one queue, one dataset out the end.
const SOURCES = ["Traces", "Datasets", "SQL results"];

const ITEMS = [
  { data: "Booked NRT, no return leg", target: "incomplete", approved: true },
  { data: "Cancelled the wrong leg", target: "wrong", approved: true },
  { data: "Confirmed before booking", target: "correct", approved: true },
  { data: "Retried after a gateway 504", target: "correct", approved: false },
];

const AnnotationB = () => (
  <div className="absolute inset-0 overflow-hidden pl-6">
    <div className="flex gap-1.5 pr-5">
      {SOURCES.map((source) => (
        <span
          key={source}
          className="flex-1 truncate rounded border border-surface-up-2 bg-surface-down px-1.5 py-1 text-center text-[10px] text-foreground-400"
        >
          {source}
        </span>
      ))}
    </div>

    {/* The funnel: a drop from each source onto one rail, then into the queue. */}
    <div className="relative mr-5 h-4">
      <span className="absolute left-[16%] top-0 h-2 w-px bg-surface-up-4" />
      <span className="absolute left-1/2 top-0 h-2 w-px bg-surface-up-4" />
      <span className="absolute left-[84%] top-0 h-2 w-px bg-surface-up-4" />
      <span className="absolute left-[16%] top-2 h-px w-[68%] bg-surface-up-4" />
      <span className="absolute left-1/2 top-2 h-2 w-px bg-surface-up-4" />
    </div>

    <div className="rounded-tl border-t border-l border-surface-up-2 bg-surface-down">
      <div className="flex gap-2 border-b border-surface-up-2 px-3 py-1.5 text-[10px] text-foreground-500">
        <span className="flex-1">data</span>
        <span className="w-[62px] shrink-0">target</span>
      </div>
      {ITEMS.map((item) => (
        <div key={item.data} className="flex items-center gap-2 border-b border-surface-up/60 px-3 py-2 last:border-0">
          <span className="min-w-0 flex-1 truncate text-[10px] text-foreground-200">{item.data}</span>
          <span
            className={
              item.approved
                ? "w-[62px] shrink-0 truncate font-mono text-[9px] text-primary-200"
                : "w-[62px] shrink-0 truncate font-mono text-[9px] text-foreground-600"
            }
          >
            {item.target}
          </span>
        </div>
      ))}
    </div>

    <div className="mt-2.5 inline-flex items-center gap-1.5 rounded border border-surface-up-3 px-2 py-1">
      <Database className="size-3 text-foreground-400" strokeWidth={1.75} />
      <span className="text-[10px] text-foreground-300">Push to dataset</span>
    </div>
  </div>
);

export default AnnotationB;
