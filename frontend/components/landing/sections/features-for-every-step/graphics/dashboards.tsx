import { GripVertical, Plus } from "lucide-react";

// The dashboard is a drag-and-drop grid, so the graphic is one: charts placed,
// one mid-drag, an empty cell waiting. The series needs uneven steps the whole
// way across — even ones read as noise on a ramp, and variation saved for one
// end reads as a flat opening — and has to spend most of SPARK_MAX to show up.
const SPARK = [12, 34, 26, 31, 21, 46, 38, 43, 62, 50, 58, 76, 67, 74];
const SPARK_MAX = 80;
const SPARK_H = 22;

const Handle = () => <GripVertical className="size-3 shrink-0 text-foreground-600" strokeWidth={1.5} />;

const Dashboards = () => (
  <div className="absolute inset-0 overflow-hidden">
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
          <p className="truncate text-[10px] text-foreground-400">Subagents per run</p>
          <Handle />
        </div>
        <p className="mt-0.5 font-mono text-base leading-6 text-white">4.34</p>
        <svg
          viewBox={`0 0 100 ${SPARK_H}`}
          preserveAspectRatio="none"
          style={{ height: SPARK_H }}
          className="mt-1 w-full"
          aria-hidden
        >
          <path
            d={`M${SPARK.map((v, i) => `${(i * 100) / (SPARK.length - 1)},${SPARK_H - (v / SPARK_MAX) * SPARK_H}`).join(
              " L"
            )}`}
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
          {/* A top-N chart is sorted, so it falls away rather than zigzagging,
              and real span-name counts are long-tailed. */}
          {[100, 71, 58, 39, 31, 24, 20, 14, 11, 9, 7, 5].map((h, i) => (
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
