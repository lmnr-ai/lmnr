import { ChevronDown } from "lucide-react";

const SERIES = [22, 30, 26, 41, 35, 48, 44, 58, 51, 66, 60, 74, 69, 82];

const points = SERIES.map((v, i) => `${(i * 120) / (SERIES.length - 1)},${110 - (v / 90) * 110}`).join(" L");

// A saved query becomes a chart. The parameters are the product's own: charts
// are bound to the dashboard's time range, not to a hardcoded window.
const DashboardsB = () => (
  <div className="absolute inset-0 overflow-hidden pl-[22px]">
    <div className="rounded-tl border-t border-l border-surface-up-2 bg-surface-down px-3 py-2.5 font-mono text-[10px] leading-[15px]">
      <p className="whitespace-nowrap">
        <span className="text-primary-300">SELECT</span>{" "}
        <span className="text-foreground-200">toStartOfInterval(start_time…</span>
      </p>
      <p className="whitespace-nowrap">
        <span className="pl-4 text-foreground-200">quantile(0.9)(duration) </span>
        <span className="text-primary-300">AS</span> <span className="text-foreground-200">p90</span>
      </p>
      <p>
        <span className="text-primary-300">FROM</span> <span className="text-foreground-200">traces</span>
      </p>
      <p className="whitespace-nowrap">
        <span className="text-primary-300">WHERE</span>{" "}
        <span className="text-foreground-200">start_time &gt;= {"{start_time}"}</span>
      </p>
    </div>

    <ChevronDown className="my-1.5 ml-4 size-3.5 text-foreground-500" strokeWidth={1.5} />

    <div className="rounded-tl border-t border-l border-surface-up-2 bg-surface-down p-3">
      <p className="text-[10px] text-foreground-400">Trace p90 duration</p>
      <div className="relative mt-3 h-[110px]">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="absolute inset-x-0 h-px bg-surface-up" style={{ top: `${i * 36}px` }} />
        ))}
        <svg viewBox="0 0 120 110" preserveAspectRatio="none" className="absolute inset-0 size-full" aria-hidden>
          <path d={`M${points} L120,110 L0,110 Z`} className="fill-primary-400/12" />
          <path
            d={`M${points}`}
            className="fill-none stroke-primary-400"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
      <div className="mt-2 flex justify-between font-mono text-[9px] text-foreground-500">
        <span>00:00</span>
        <span>12:00</span>
        <span>24:00</span>
      </div>
    </div>
  </div>
);

export default DashboardsB;
