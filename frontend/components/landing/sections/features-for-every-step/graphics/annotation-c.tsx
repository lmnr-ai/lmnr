// The labelling form the queue builds from your schema: one block per
// dimension, the focused one outlined, and every option carrying the number key
// that picks it. Tab moves between dimensions, so a hand never leaves the keys.
const VERDICTS = [
  { label: "correct", key: 1 },
  { label: "partial", key: 2 },
  { label: "wrong", key: 3, selected: true },
];

const AnnotationC = () => (
  <div className="absolute inset-0 overflow-hidden pl-[22px]">
    <div className="mr-4 rounded-lg border border-primary-400/60 bg-primary-400/[0.06] p-2.5">
      <div className="flex items-center gap-1.5">
        <span className="rounded border border-surface-up-3 bg-surface-down px-1 py-px font-mono text-[9px] text-foreground-200">
          verdict
        </span>
        <span className="truncate text-[10px] text-foreground-400">Did the run finish the task</span>
      </div>
      <div className="mt-2 flex gap-1">
        {VERDICTS.map((verdict) => (
          <span
            key={verdict.label}
            className={
              verdict.selected
                ? "inline-flex items-center gap-1.5 rounded bg-foreground-100 px-1.5 py-1 text-[10px] text-black"
                : "inline-flex items-center gap-1.5 rounded border border-surface-up-3 px-1.5 py-1 text-[10px] text-foreground-300"
            }
          >
            {verdict.label}
            <span
              className={
                verdict.selected
                  ? "rounded bg-black/15 px-1 text-[9px]"
                  : "rounded bg-surface-up-2 px-1 text-[9px] text-foreground-500"
              }
            >
              {verdict.key}
            </span>
          </span>
        ))}
      </div>
    </div>

    <div className="mr-4 mt-2 rounded-lg border border-surface-up-2 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="rounded border border-surface-up-3 bg-surface-down px-1 py-px font-mono text-[9px] text-foreground-200">
            severity
          </span>
          <span className="truncate text-[10px] text-foreground-400">How bad</span>
        </div>
        <span className="shrink-0 text-[9px] italic text-foreground-600">Not labelled</span>
      </div>
      <div className="mt-2.5 h-1 rounded-full bg-surface-up-2">
        <span className="block h-full w-[40%] rounded-full bg-white/20" />
      </div>
      <div className="mt-1.5 flex justify-between text-[9px] text-foreground-600">
        <span>1</span>
        <span>5</span>
      </div>
    </div>

    <div className="mr-4 mt-2 rounded-lg border border-surface-up-2 p-2.5">
      <div className="flex items-center gap-1.5">
        <span className="rounded border border-surface-up-3 bg-surface-down px-1 py-px font-mono text-[9px] text-foreground-200">
          note
        </span>
        <span className="truncate text-[10px] text-foreground-400">Anything else</span>
      </div>
      <div className="mt-2 rounded border border-surface-up-3 bg-surface-down px-2 py-1.5 text-[10px] text-foreground-600">
        Input text...
      </div>
    </div>

    <p className="mt-3 text-[10px] text-foreground-500">
      <span className="rounded bg-surface-up-2 px-1 py-px text-foreground-300">Tab</span> next dimension
    </p>
  </div>
);

export default AnnotationC;
