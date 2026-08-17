// The schema browser. "All platform data" is a claim; a table list is proof.
const TABLES = [
  { name: "spans", columns: "span_id · trace_id · input · output · cost" },
  { name: "traces", columns: "trace_id · duration · total_tokens · status" },
  { name: "signal_events", columns: "event_id · signal_id · cluster_id" },
  { name: "evaluations", columns: "eval_id · score · target · duration" },
  { name: "datasets", columns: "dataset_id · name · size" },
  { name: "labeling_queues", columns: "queue_id · item_id · label" },
];

const SqlC = () => (
  <div className="absolute inset-0 overflow-hidden pl-5">
    <p className="mb-2 text-[10px] text-foreground-500">Schema</p>
    <div className="flex flex-col gap-1.5">
      {TABLES.map((table) => (
        <div key={table.name} className="rounded-tl border-t border-l border-surface-350 bg-surface-200 px-3 py-2">
          <p className="font-mono text-[11px] text-white">{table.name}</p>
          <p className="mt-0.5 truncate font-mono text-[9px] text-foreground-500">{table.columns}</p>
        </div>
      ))}
    </div>
  </div>
);

export default SqlC;
