const ROWS = [
  ["gpt-5.1", "8,412", "0.42"],
  ["opus-4.6", "6,205", "0.31"],
  ["haiku-4.5", "3,918", "0.07"],
  ["gemini-3", "1,744", "0.12"],
  ["sonnet-5", "1,208", "0.09"],
];

// The SQL editor: query above, result table below, both cropped by the card.
const SqlA = () => (
  <div className="absolute inset-0 overflow-hidden pl-5">
    <div className="rounded-tl border-t border-l border-surface-350 bg-surface-200 px-3 py-2.5 font-mono text-[10px] leading-[15px]">
      <p>
        <span className="text-primary-300">select</span> <span className="text-foreground-200">model,</span>
      </p>
      <p className="pl-6 text-foreground-200">
        count(*) <span className="text-primary-300">as</span> runs, sum(cost)
      </p>
      <p>
        <span className="text-primary-300">from</span> <span className="text-foreground-200">spans</span>
      </p>
      <p>
        <span className="text-primary-300">group by</span> <span className="text-foreground-200">model</span>
      </p>
    </div>

    <div className="mt-2 rounded-tl border-t border-l border-surface-350 bg-surface-200">
      <div className="flex gap-3 border-b border-surface-350 px-3 py-1.5 text-[10px] text-foreground-500">
        <span className="w-[82px] shrink-0">model</span>
        <span className="w-[44px] shrink-0 text-right">runs</span>
        <span className="w-[44px] shrink-0 text-right">cost</span>
      </div>
      {ROWS.map(([model, runs, cost]) => (
        <div key={model} className="flex gap-3 px-3 py-[7px] font-mono text-[10px] text-foreground-200">
          <span className="w-[82px] shrink-0 truncate">{model}</span>
          <span className="w-[44px] shrink-0 text-right">{runs}</span>
          <span className="w-[44px] shrink-0 text-right">{cost}</span>
        </div>
      ))}
    </div>
  </div>
);

export default SqlA;
