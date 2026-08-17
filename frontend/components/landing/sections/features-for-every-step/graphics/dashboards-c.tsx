// The dashboard as a canvas: tiles of different shapes on a grid, one being
// dragged into place. Says "build your own" without a word of copy.
const SPARK = [30, 44, 38, 56, 48, 66, 58, 72];

const DashboardsC = () => (
  <div className="absolute inset-0 overflow-hidden pl-5">
    {/* The canvas the tiles snap to. */}
    <div
      className="absolute inset-0 left-5 opacity-[0.35]"
      style={{
        backgroundImage:
          "linear-gradient(to right, var(--color-surface-300) 1px, transparent 1px), linear-gradient(to bottom, var(--color-surface-300) 1px, transparent 1px)",
        backgroundSize: "16px 16px",
      }}
    />

    <div className="relative grid grid-cols-3 gap-2">
      <div className="col-span-2 rounded border border-surface-350 bg-surface-200 p-2.5">
        <p className="text-[10px] text-foreground-500">Cost / run</p>
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

      <div className="rounded border border-surface-350 bg-surface-200 p-2.5">
        <p className="text-[10px] text-foreground-500">Pass</p>
        <p className="mt-0.5 font-mono text-base leading-6 text-white">94%</p>
      </div>

      <div className="col-span-3 rounded border border-surface-350 bg-surface-200 p-2.5">
        <p className="text-[10px] text-foreground-500">Runs by hour</p>
        <div className="mt-2 flex h-[48px] items-end gap-[4px]">
          {[38, 52, 44, 66, 58, 80, 70, 90, 62, 74, 55, 68].map((h, i) => (
            <div key={i} className="flex-1 rounded-t-[1px] bg-surface-450" style={{ height: `${h}%` }} />
          ))}
        </div>
      </div>

      {/* Mid-drag: dashed outline, lifted, snapping to the next cell. */}
      <div className="col-span-2 rounded border border-dashed border-primary-400/60 bg-primary-400/[0.06] p-2.5">
        <p className="text-[10px] text-primary-200">Tokens / run</p>
        <p className="mt-0.5 font-mono text-base leading-6 text-white">48.2k</p>
      </div>
      <div className="rounded border border-dashed border-surface-400" />
    </div>
  </div>
);

export default DashboardsC;
