// The recording sits on the trace's own timeline, and one playhead crosses
// both. That shared instant is the whole feature.
const SPANS = [
  { left: 0, width: 96, lit: true },
  { left: 6, width: 38, lit: false },
  { left: 22, width: 30, lit: false },
  { left: 30, width: 46, lit: true },
  { left: 48, width: 26, lit: false },
  { left: 62, width: 34, lit: false },
];

const ScreenRecordingA = () => (
  <div className="absolute inset-0 overflow-hidden pl-5">
    <div className="overflow-hidden rounded-tl border-t border-l border-surface-350 bg-surface-100">
      <div className="flex items-center gap-1.5 border-b border-surface-350 bg-surface-200 px-2.5 py-[7px]">
        <span className="size-[5px] rounded-full bg-surface-450" />
        <span className="size-[5px] rounded-full bg-surface-450" />
        <span className="ml-1.5 rounded-sm bg-surface-300 px-1.5 py-[2px] font-mono text-[8px] text-foreground-500">
          flights.example.com
        </span>
        <span className="ml-auto flex items-center gap-1 pr-1">
          <span className="size-[5px] rounded-full bg-red-400/80" />
          <span className="font-mono text-[8px] text-foreground-500">REC</span>
        </span>
      </div>
      <div className="relative flex h-[84px] gap-2 p-2.5">
        <div className="flex w-[46px] shrink-0 flex-col gap-1">
          <span className="h-1.5 w-full rounded-sm bg-surface-300" />
          <span className="h-1.5 w-[70%] rounded-sm bg-surface-300" />
          <span className="h-1.5 w-[85%] rounded-sm bg-surface-300" />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <span className="h-2 w-[60%] rounded-sm bg-surface-400" />
          <div className="flex gap-1.5">
            <span className="h-8 flex-1 rounded-sm bg-surface-200" />
            <span className="h-8 flex-1 rounded-sm bg-surface-200" />
          </div>
          <span className="h-[18px] w-[62px] rounded-sm bg-primary-400/35" />
        </div>
        {/* Cursor, mid-click on the button. */}
        <svg viewBox="0 0 12 14" className="absolute left-[92px] top-[62px] w-3 text-white" aria-hidden>
          <path d="M1 1l10 6.5-4.4.9L4.3 13z" fill="currentColor" stroke="#111" strokeWidth="0.9" />
        </svg>
      </div>
    </div>

    <div className="relative mt-3 flex flex-col gap-[7px] pr-5">
      {SPANS.map((span, i) => (
        <div key={i} className="h-1.5 w-full">
          <div
            className={span.lit ? "h-full rounded-full bg-primary-400/70" : "h-full rounded-full bg-surface-450"}
            style={{ marginLeft: `${span.left}%`, width: `${span.width}%` }}
          />
        </div>
      ))}
      {/* Playhead, parked on the instant of the click above. */}
      <span className="absolute -top-[110px] bottom-0 left-[36%] w-px bg-white/45" />
      <span className="absolute -top-[114px] left-[36%] size-[5px] -translate-x-1/2 rounded-full bg-white" />
    </div>
  </div>
);

export default ScreenRecordingA;
