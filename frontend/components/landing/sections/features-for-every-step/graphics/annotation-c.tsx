// "Fast" is the claim, so the graphic is the keyboard. One item on screen, one
// key per verdict, and the queue advances.
const KEYS = [
  { cap: "1", label: "correct", lit: true },
  { cap: "2", label: "incomplete", lit: false },
  { cap: "3", label: "wrong", lit: false },
];

const AnnotationC = () => (
  <div className="absolute inset-0 overflow-hidden pl-5">
    <div className="rounded-tl border-t border-l border-surface-350 bg-surface-200 p-3 pr-6">
      <p className="text-[10px] text-foreground-500">item 18 of 240</p>
      <p className="mt-1.5 text-[11px] leading-4 text-foreground-200">
        Booked <span className="text-white">NRT</span>, departing Mar 4. Never checked the return leg.
      </p>
    </div>

    <div className="mt-3 flex flex-col gap-1.5">
      {KEYS.map((key) => (
        <div key={key.cap} className="flex items-center gap-2.5">
          <span
            className={
              key.lit
                ? "flex size-[22px] items-center justify-center rounded border border-primary-400/60 bg-primary-400/15 font-mono text-[11px] text-primary-200"
                : "flex size-[22px] items-center justify-center rounded border border-surface-400 font-mono text-[11px] text-foreground-500"
            }
          >
            {key.cap}
          </span>
          <span className={key.lit ? "text-[11px] text-white" : "text-[11px] text-foreground-500"}>{key.label}</span>
        </div>
      ))}
    </div>

    <div className="mt-4 flex items-center gap-2.5">
      <span className="flex h-[22px] items-center justify-center rounded border border-surface-400 px-2 font-mono text-[11px] text-foreground-500">
        ↵
      </span>
      <span className="text-[11px] text-foreground-500">next item</span>
    </div>

    <div className="mt-4 mr-5 h-1 overflow-hidden rounded-full bg-surface-350">
      <div className="h-full w-[7.5%] rounded-full bg-primary-400" />
    </div>
  </div>
);

export default AnnotationC;
