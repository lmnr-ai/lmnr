import { ChevronDown } from "lucide-react";

const SERIES = [22, 30, 26, 41, 35, 48, 44, 58, 51, 66, 60, 74, 69, 82];

// A query becomes a chart. The chevron is the whole story of the feature.
const DashboardsB = () => (
  <div className="absolute inset-0 overflow-hidden pl-5">
    <div className="rounded-tl border-t border-l border-surface-350 bg-surface-200 px-3 py-2.5 font-mono text-[10px] leading-[15px]">
      <p>
        <span className="text-primary-300">select</span>{" "}
        <span className="text-foreground-200">time_bucket, avg(latency)</span>
      </p>
      <p>
        <span className="text-primary-300">from</span> <span className="text-foreground-200">spans</span>
      </p>
    </div>

    <ChevronDown className="my-1 ml-4 size-3.5 text-foreground-500" strokeWidth={1.5} />

    <div className="rounded-tl border-t border-l border-surface-350 bg-surface-200 p-3">
      <p className="text-[10px] text-foreground-500">Average latency</p>
      <div className="relative mt-3 h-[110px]">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="absolute inset-x-0 h-px bg-surface-300" style={{ top: `${i * 36}px` }} />
        ))}
        <svg viewBox="0 0 120 92" preserveAspectRatio="none" className="absolute inset-0 size-full" aria-hidden>
          <path
            d={`M${SERIES.map((v, i) => `${(i * 120) / (SERIES.length - 1)},${92 - (v / 90) * 92}`).join(" L")} L120,92 L0,92 Z`}
            className="fill-primary-400/12"
          />
          <path
            d={`M${SERIES.map((v, i) => `${(i * 120) / (SERIES.length - 1)},${92 - (v / 90) * 92}`).join(" L")}`}
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

    <div className="mt-2 flex gap-2">
      <div className="flex-1 rounded-tl border-t border-l border-surface-350 bg-surface-200 p-2.5">
        <p className="text-[10px] text-foreground-500">p50</p>
        <p className="mt-0.5 font-mono text-[12px] text-white">1.9s</p>
      </div>
      <div className="flex-1 rounded-tl border-t border-l border-surface-350 bg-surface-200 p-2.5">
        <p className="text-[10px] text-foreground-500">p95</p>
        <p className="mt-0.5 font-mono text-[12px] text-white">6.4s</p>
      </div>
    </div>
  </div>
);

export default DashboardsB;
