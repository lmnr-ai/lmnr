import { GripVertical, Plus } from "lucide-react";

// The dashboard is a drag-and-drop grid, so the graphic is the grid: charts
// already placed, one mid-drag, and an empty cell waiting for the next.
const SPARK = [30, 44, 38, 56, 48, 66, 58, 72];

const Handle = () => <GripVertical className="size-3 shrink-0 text-foreground-600" strokeWidth={1.5} />;

const Dashboards = () => (
  <div className="absolute inset-0 overflow-hidden pl-[22px]">
    <div
      className="absolute inset-0 left-5 opacity-40"
      style={{
        backgroundImage:
          "linear-gradient(to right, var(--color-surface-up) 1px, transparent 1px), linear-gradient(to bottom, var(--color-surface-up) 1px, transparent 1px)",
        backgroundSize: "18px 18px",
      }}
    />

    <div className="relative grid grid-cols-3 gap-2">
      <div className="col-span-2 rounded border border-surface-up-2 bg-surface-down p-2.5">
        <div className="flex items-center justify-between">
          <p className="truncate text-[10px] text-foreground-400">Trace p90 cost</p>
          <Handle />
        </div>
        <p className="mt-0.5 font-mono text-base leading-6 text-white">$0.031</p>
        <svg viewBox="0 0 100 22" preserveAspectRatio="none" className="mt-1 h-[22px] w-full" aria-hidden>
          <path
            d={`M${SPARK.map((v, i) => `${(i * 100) / (SPARK.length - 1)},${22 - (v / 80) * 22}`).join(" L")}`}
            className="fill-none stroke-primary-400"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>

      <div className="rounded border border-surface-up-2 bg-surface-down p-2.5">
        <p className="truncate text-[10px] text-foreground-400">New traces</p>
        <p className="mt-0.5 font-mono text-base leading-6 text-white">12.4k</p>
      </div>

      <div className="col-span-3 rounded border border-surface-up-2 bg-surface-down p-2.5">
        <div className="flex items-center justify-between">
          <p className="truncate text-[10px] text-foreground-400">Top span names</p>
          <Handle />
        </div>
        <div className="mt-2 flex h-[46px] items-end gap-[4px]">
          {[38, 52, 44, 66, 58, 80, 70, 90, 62, 74, 55, 68].map((h, i) => (
            <div key={i} className="flex-1 rounded-t-[1px] bg-surface-up-4" style={{ height: `${h}%` }} />
          ))}
        </div>
      </div>

      {/* Mid-drag: lifted off the grid, snapping to the next free cell. */}
      <div className="col-span-2 rounded border border-dashed border-primary-400/60 bg-primary-400/[0.06] p-2.5">
        <div className="flex items-center justify-between">
          <p className="truncate text-[10px] text-primary-200">Total tokens</p>
          <GripVertical className="size-3 shrink-0 text-primary-300" strokeWidth={1.5} />
        </div>
        <p className="mt-0.5 font-mono text-base leading-6 text-white">48.2M</p>
      </div>

      <div className="flex items-center justify-center rounded border border-dashed border-surface-up-3">
        <Plus className="size-4 text-foreground-600" strokeWidth={1.5} />
      </div>
    </div>
  </div>
);

export default Dashboards;
