// "Fast" is the claim, so the graphic is the keyboard. These are the queue's
// real bindings: approve, discard, and step, without leaving the editor.
const KEYS = [
  { cap: "⌘ ↵", label: "approve", lit: true },
  { cap: "⌘ ⌫", label: "discard", lit: false },
  { cap: "⌘ →", label: "next item", lit: false },
  { cap: "⌘ ←", label: "previous item", lit: false },
];

const AnnotationC = () => (
  <div className="absolute inset-0 overflow-hidden pl-6">
    <div className="rounded-tl border-t border-l border-surface-up-2 bg-surface-down">
      <div className="flex items-center justify-between border-b border-surface-up-2 px-3 py-1.5 pr-6">
        <span className="text-[10px] text-foreground-500">
          Item <span className="text-foreground-200">18</span> of 240
        </span>
        <span className="text-[10px] text-foreground-500">17 approved</span>
      </div>
      <p className="px-3 py-2.5 pr-6 text-[11px] leading-4 text-foreground-200">
        Booked <span className="text-white">NRT</span>, departing Mar 4. Never checked the return leg.
      </p>
    </div>

    <div className="mt-3.5 flex flex-col gap-2">
      {KEYS.map((key) => (
        <div key={key.cap} className="flex items-center gap-2.5">
          <span
            className={
              key.lit
                ? "flex h-[22px] w-[42px] items-center justify-center rounded border border-primary-400/60 bg-primary-400/15 font-mono text-[10px] text-primary-200"
                : "flex h-[22px] w-[42px] items-center justify-center rounded border border-surface-up-3 font-mono text-[10px] text-foreground-500"
            }
          >
            {key.cap}
          </span>
          <span className={key.lit ? "text-[11px] text-white" : "text-[11px] text-foreground-500"}>{key.label}</span>
        </div>
      ))}
    </div>

    <div className="mr-5 mt-4 h-1 overflow-hidden rounded-full bg-surface-up-2">
      <div className="h-full w-[7.5%] rounded-full bg-primary-400" />
    </div>
  </div>
);

export default AnnotationC;
