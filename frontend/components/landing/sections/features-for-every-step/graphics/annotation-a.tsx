// A labeling queue mid-pass: the item under review on top, its verdict buttons
// under it, and the next items already stacked below.
const QUEUED = [
  "Cancelled the wrong leg and rebooked at a higher fare.",
  "Asked for confirmation twice before booking.",
];

const AnnotationA = () => (
  <div className="absolute inset-0 overflow-hidden pl-5">
    <div className="rounded-tl border-t border-l border-surface-350 bg-surface-200">
      <div className="flex items-center justify-between border-b border-surface-350 px-3 py-1.5 pr-6">
        <span className="text-[10px] text-foreground-500">item 18</span>
        <span className="font-mono text-[10px] text-foreground-500">18 / 240</span>
      </div>
      <p className="px-3 py-2.5 pr-6 text-[11px] leading-4 text-foreground-200">
        Booked <span className="text-white">NRT</span>, departing Mar 4. Never checked the return leg.
      </p>
      <div className="flex gap-1.5 px-3 pb-3">
        <span className="rounded border border-green-400/40 bg-green-400/10 px-2 py-1 text-[10px] text-green-300">
          correct
        </span>
        <span className="rounded border border-surface-400 px-2 py-1 text-[10px] text-foreground-400">incomplete</span>
        <span className="rounded border border-surface-400 px-2 py-1 text-[10px] text-foreground-400">wrong</span>
      </div>
    </div>

    {QUEUED.map((item) => (
      <p
        key={item}
        className="mt-2 truncate rounded-tl border-t border-l border-surface-350 bg-surface-200/60 px-3 py-2.5 pr-6 text-[11px] text-foreground-500"
      >
        {item}
      </p>
    ))}
  </div>
);

export default AnnotationA;
