// Same data, three doors. The CLI door is open, so the graphic is a terminal.
const TABS = ["SQL editor", "MCP", "CLI"];

const OUTPUT = [
  ["gpt-5.1", "8,412"],
  ["opus-4.6", "6,205"],
  ["haiku-4.5", "3,918"],
  ["gemini-3", "1,744"],
  ["sonnet-5", "1,208"],
  ["o4-mini", "864"],
];

const SqlB = () => (
  <div className="absolute inset-0 overflow-hidden pl-5">
    <div className="flex gap-1">
      {TABS.map((tab) => (
        <span
          key={tab}
          className={
            tab === "CLI"
              ? "rounded-t border-x border-t border-surface-350 bg-surface-200 px-2 py-1 text-[10px] text-white"
              : "rounded-t px-2 py-1 text-[10px] text-foreground-500"
          }
        >
          {tab}
        </span>
      ))}
    </div>

    <div className="rounded-tl border-t border-l border-surface-350 bg-surface-200 px-3 py-2.5 font-mono text-[10px] leading-[17px]">
      <p className="whitespace-nowrap">
        <span className="text-foreground-500">$ </span>
        <span className="text-foreground-100">lmnr sql query </span>
        <span className="text-primary-300">&quot;select model, count(*)…&quot;</span>
      </p>
      <div className="mt-2 flex text-foreground-500">
        <span className="w-[76px]">model</span>
        <span>runs</span>
      </div>
      <div className="my-1 h-px w-[140px] bg-surface-350" />
      {OUTPUT.map(([model, runs]) => (
        <div key={model} className="flex text-foreground-200">
          <span className="w-[76px]">{model}</span>
          <span>{runs}</span>
        </div>
      ))}
      <p className="mt-1 text-foreground-100">
        $ <span className="animate-pulse">▍</span>
      </p>
    </div>
  </div>
);

export default SqlB;
