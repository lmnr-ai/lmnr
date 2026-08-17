// "All platform data" is a claim; the editor's own table list is the proof.
// Names and columns are the SQL editor's schema, verbatim.
const TABLES = [
  { name: "traces", columns: "id · duration · total_tokens · agent_input" },
  { name: "spans", columns: "span_id · path · input · output · model" },
  { name: "trace_outputs", columns: "trace_id · agent_output" },
  { name: "evaluation_datapoints", columns: "evaluation_id · scores · target" },
  { name: "dataset_datapoints", columns: "dataset_id · data · target" },
  { name: "signal_events", columns: "signal_id · trace_id · run_id" },
  { name: "clusters", columns: "signal_id · name · level · parent_id" },
  { name: "logs", columns: "log_id · time · severity_number · body" },
];

const SqlC = () => (
  <div className="absolute inset-0 overflow-hidden pl-6">
    <p className="mb-2 text-[10px] text-foreground-500">Schema</p>
    <div className="flex flex-col gap-1.5">
      {TABLES.map((table) => (
        <div key={table.name} className="rounded-tl border-t border-l border-surface-up-2 bg-surface-down px-3 py-2">
          <p className="font-mono text-[11px] text-white">{table.name}</p>
          <p className="mt-0.5 truncate font-mono text-[9px] text-foreground-500">{table.columns}</p>
        </div>
      ))}
    </div>
  </div>
);

export default SqlC;
