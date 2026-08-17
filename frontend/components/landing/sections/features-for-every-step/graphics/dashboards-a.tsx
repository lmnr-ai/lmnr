const AREA = [18, 26, 22, 34, 30, 44, 39, 52, 48, 61, 57, 70];
const BARS = [40, 62, 34, 78, 55, 88, 47, 69, 58];

const path = (values: number[], w: number, h: number, close: boolean) => {
  const max = Math.max(...values);
  const step = w / (values.length - 1);
  const line = values.map((v, i) => `${i === 0 ? "M" : "L"}${i * step},${h - (v / max) * h}`).join(" ");
  return close ? `${line} L${w},${h} L0,${h} Z` : line;
};

// Four tiles of a dashboard, cropped by the card's right and bottom edges.
const DashboardsA = () => (
  <div className="absolute inset-0 overflow-hidden pl-5">
    <div className="grid grid-cols-2 gap-2">
      <div className="rounded border border-surface-350 bg-surface-200 p-2.5">
        <p className="text-[10px] text-foreground-500">Runs today</p>
        <p className="mt-1 font-mono text-lg leading-6 text-white">12.4k</p>
        <p className="text-[10px] text-green-400">▲ 18.2%</p>
      </div>

      <div className="rounded border border-surface-350 bg-surface-200 p-2.5">
        <p className="text-[10px] text-foreground-500">p95 latency</p>
        <svg viewBox="0 0 100 34" preserveAspectRatio="none" className="mt-2 h-[34px] w-full" aria-hidden>
          <path d={path(AREA, 100, 34, true)} className="fill-primary-400/15" />
          <path d={path(AREA, 100, 34, false)} className="stroke-primary-400 fill-none" strokeWidth="1.5" />
        </svg>
      </div>
    </div>

    <div className="mt-2 rounded border border-surface-350 bg-surface-200 p-2.5">
      <p className="text-[10px] text-foreground-500">Signal events by cluster</p>
      <div className="mt-2.5 flex h-[58px] items-end gap-[5px]">
        {BARS.map((h, i) => (
          <div
            key={i}
            className={i === 5 ? "flex-1 rounded-t-[1px] bg-primary-400" : "flex-1 rounded-t-[1px] bg-surface-450"}
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
    </div>

    <div className="mt-2 flex items-center justify-between rounded border border-surface-350 bg-surface-200 p-2.5">
      <p className="text-[10px] text-foreground-500">Tool error rate</p>
      <p className="font-mono text-[11px] text-white">0.42%</p>
    </div>
  </div>
);

export default DashboardsA;
