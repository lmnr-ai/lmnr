// The SQL editor: query above, result table below. Columns are the `spans`
// table's own (model, total_cost), so the query would actually run.
const ROWS = [
  ["gpt-5.1", "8,412", "0.42"],
  ["opus-4.6", "6,205", "0.31"],
  ["haiku-4.5", "3,918", "0.07"],
  ["gemini-3", "1,744", "0.12"],
  ["sonnet-5", "1,208", "0.09"],
];

const Sql = () => (
  <div className="absolute inset-0 overflow-hidden pl-[22px]">
    <div className="rounded-tl border-t border-l border-surface-up-2 bg-surface-down px-3 py-2.5 font-mono text-[10px] leading-[15px]">
      <p>
        <span className="text-primary-300">SELECT</span> <span className="text-foreground-200">model,</span>
      </p>
      <p className="pl-5 text-foreground-200">
        count(*) <span className="text-primary-300">AS</span> runs,
      </p>
      <p className="pl-5 text-foreground-200">
        sum(total_cost) <span className="text-primary-300">AS</span> cost
      </p>
      <p>
        <span className="text-primary-300">FROM</span> <span className="text-foreground-200">spans</span>
      </p>
      <p>
        <span className="text-primary-300">GROUP BY</span> <span className="text-foreground-200">model</span>
      </p>
    </div>

    <div className="mt-2 rounded-tl border-t border-l border-surface-up-2 bg-surface-down">
      <div className="flex gap-3 border-b border-surface-up-2 px-3 py-1.5 text-[10px] text-foreground-500">
        <span className="w-[78px] shrink-0">model</span>
        <span className="w-[44px] shrink-0 text-right">runs</span>
        <span className="w-[44px] shrink-0 text-right">cost</span>
      </div>
      {ROWS.map(([model, runs, cost]) => (
        <div key={model} className="flex gap-3 px-3 py-[7px] font-mono text-[10px] text-foreground-200">
          <span className="w-[78px] shrink-0 truncate">{model}</span>
          <span className="w-[44px] shrink-0 text-right">{runs}</span>
          <span className="w-[44px] shrink-0 text-right">{cost}</span>
        </div>
      ))}
    </div>
  </div>
);

export default Sql;
