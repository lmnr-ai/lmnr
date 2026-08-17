import { GripVertical } from "lucide-react";

// Four charts off the dashboard's own preset list, laid out on its grid. Names
// and shapes are the product's: line, bar, and a total.
const LINE = [18, 26, 22, 34, 30, 44, 39, 52, 48, 61, 57, 70];
const BARS = [40, 62, 34, 78, 55, 88, 47, 69, 58];

const linePath = (values: number[], w: number, h: number, close: boolean) => {
  const max = Math.max(...values);
  const step = w / (values.length - 1);
  const line = values.map((v, i) => `${i === 0 ? "M" : "L"}${i * step},${h - (v / max) * h}`).join(" ");
  return close ? `${line} L${w},${h} L0,${h} Z` : line;
};

const ChartTitle = ({ children }: { children: string }) => (
  <div className="flex items-center justify-between">
    <p className="truncate text-[10px] text-foreground-400">{children}</p>
    <GripVertical className="size-3 shrink-0 text-foreground-600" strokeWidth={1.5} />
  </div>
);

const DashboardsA = () => (
  <div className="absolute inset-0 overflow-hidden pl-[22px]">
    <div className="grid grid-cols-2 gap-2">
      <div className="rounded border border-surface-up-2 bg-surface-down p-2.5">
        <ChartTitle>Total cost</ChartTitle>
        <p className="mt-1.5 font-mono text-lg leading-6 text-white">$412.80</p>
      </div>

      <div className="rounded border border-surface-up-2 bg-surface-down p-2.5">
        <ChartTitle>Trace p90 duration</ChartTitle>
        <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="mt-2 h-8 w-full" aria-hidden>
          <path d={linePath(LINE, 100, 32, true)} className="fill-primary-400/15" />
          <path
            d={linePath(LINE, 100, 32, false)}
            className="fill-none stroke-primary-400"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
    </div>

    <div className="mt-2 rounded border border-surface-up-2 bg-surface-down p-2.5">
      <ChartTitle>Signal events</ChartTitle>
      <div className="mt-2.5 flex h-[58px] items-end gap-[5px]">
        {BARS.map((h, i) => (
          <div
            key={i}
            className={i === 5 ? "flex-1 rounded-t-[1px] bg-primary-400" : "flex-1 rounded-t-[1px] bg-surface-up-4"}
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
    </div>

    <div className="mt-2 rounded border border-surface-up-2 bg-surface-down p-2.5">
      <ChartTitle>Tokens by model</ChartTitle>
      <div className="mt-2 flex flex-col gap-1.5">
        {[
          ["gpt-5.1", 84],
          ["opus-4.6", 61],
          ["haiku-4.5", 38],
        ].map(([model, pct]) => (
          <div key={model as string} className="flex items-center gap-2">
            <span className="w-[54px] shrink-0 truncate font-mono text-[9px] text-foreground-500">{model}</span>
            <span className="h-1.5 rounded-sm bg-surface-up-4" style={{ width: `${pct}%` }} />
          </div>
        ))}
      </div>
    </div>
  </div>
);

export default DashboardsA;
