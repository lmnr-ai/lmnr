// The SQL editor: query above, result table below. Columns are the `spans`
// table's own, and every one the table shows is selected by the query above it,
// so the pair would actually run.
const COLS = [
  { key: "model", w: "w-[86px]", align: "" },
  { key: "runs", w: "w-[46px]", align: "text-right" },
  { key: "p50_ms", w: "w-[52px]", align: "text-right" },
  { key: "tokens", w: "w-[52px]", align: "text-right" },
  { key: "cost", w: "w-[46px]", align: "text-right" },
];

const ROWS = [
  ["gpt-5.1", "8,412", "1,240", "12.4M", "0.42"],
  ["opus-4.6", "6,205", "980", "9.1M", "0.31"],
  ["haiku-4.5", "3,918", "410", "4.8M", "0.07"],
  ["gemini-3", "1,744", "720", "2.2M", "0.12"],
  ["sonnet-5", "1,208", "650", "1.6M", "0.09"],
  ["gpt-5-mini", "944", "280", "1.1M", "0.02"],
  ["o4-mini", "612", "1,890", "0.8M", "0.05"],
];

const Sql = () => (
  <div className="absolute inset-0 overflow-hidden">
    {/* Two aggregates to a line rather than one: the card is wide and the band
        is short, so the query has horizontal room to spend and none vertical. */}
    <div className="rounded-tl border-t border-l border-surface-up-2 bg-surface-down px-3 py-2.5 font-mono text-[10px] leading-[15px]">
      <p>
        <span className="text-primary-300">SELECT</span> <span className="text-foreground-200">model,</span>
      </p>
      <p className="pl-5 text-foreground-200">
        count(*) <span className="text-primary-300">AS</span> runs, avg(duration){" "}
        <span className="text-primary-300">AS</span> p50_ms,
      </p>
      <p className="pl-5 text-foreground-200">
        sum(total_tokens) <span className="text-primary-300">AS</span> tokens, sum(total_cost){" "}
        <span className="text-primary-300">AS</span> cost
      </p>
      <p>
        <span className="text-primary-300">FROM</span> <span className="text-foreground-200">spans</span>{" "}
        <span className="text-primary-300">WHERE</span>{" "}
        <span className="text-foreground-200">span_type = &apos;LLM&apos;</span>
      </p>
      <p>
        <span className="text-primary-300">GROUP BY</span> <span className="text-foreground-200">model</span>{" "}
        <span className="text-primary-300">ORDER BY</span> <span className="text-foreground-200">cost DESC</span>
      </p>
    </div>

    <div className="mt-2 rounded-tl border-t border-l border-surface-up-2 bg-surface-down">
      <div className="flex gap-3 border-b border-surface-up-2 px-3 py-1.5 text-[10px] text-foreground-500">
        {COLS.map((c) => (
          <span key={c.key} className={`${c.w} ${c.align} shrink-0`}>
            {c.key}
          </span>
        ))}
      </div>
      {ROWS.map((row) => (
        <div key={row[0]} className="flex gap-3 px-3 py-[7px] font-mono text-[10px] text-foreground-200">
          {row.map((cell, i) => (
            <span key={COLS[i].key} className={`${COLS[i].w} ${COLS[i].align} shrink-0 truncate`}>
              {cell}
            </span>
          ))}
        </div>
      ))}
    </div>
  </div>
);

export default Sql;
