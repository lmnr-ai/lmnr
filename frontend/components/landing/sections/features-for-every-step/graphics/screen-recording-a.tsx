import { Play } from "lucide-react";

// The session panel as the product builds it: play, speed, scrubber, clock, the
// page URL at that instant, then the replay. It shares its clock with the span
// timeline underneath, which is why the playhead lines up.
const SPANS = [
  { left: 0, width: 96, lit: true },
  { left: 6, width: 38, lit: false },
  { left: 22, width: 30, lit: false },
  { left: 30, width: 46, lit: true },
  { left: 48, width: 26, lit: false },
];

const ScreenRecordingA = () => (
  <div className="absolute inset-0 overflow-hidden pl-6">
    <div className="rounded-tl border-t border-l border-surface-up-2 bg-surface-down">
      <div className="flex items-center gap-2 border-b border-surface-up-2 px-2.5 py-[7px]">
        <Play className="size-3 shrink-0 fill-current text-foreground-200" strokeWidth={0} />
        <span className="shrink-0 text-[10px] text-foreground-400">1x</span>
        <span className="relative h-[3px] flex-1 rounded-full bg-surface-up-3">
          <span className="absolute inset-y-0 left-0 w-[36%] rounded-full bg-white/70" />
          <span className="absolute -top-[2px] left-[36%] size-[7px] -translate-x-1/2 rounded-full bg-white" />
        </span>
        <span className="shrink-0 font-mono text-[9px] text-foreground-400">00:11/00:31</span>
      </div>
      <p className="truncate border-b border-surface-up-2 px-2.5 py-1.5 font-mono text-[9px] text-foreground-500">
        flights.example.com/search?to=NRT
      </p>
      <div className="relative flex gap-2 bg-surface-down-3 p-2.5">
        <div className="flex w-[46px] shrink-0 flex-col gap-1">
          <span className="h-1.5 w-full rounded-sm bg-surface-up" />
          <span className="h-1.5 w-[70%] rounded-sm bg-surface-up" />
          <span className="h-1.5 w-[85%] rounded-sm bg-surface-up" />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <span className="h-2 w-[60%] rounded-sm bg-surface-up-3" />
          <div className="flex gap-1.5">
            <span className="h-7 flex-1 rounded-sm bg-surface-down" />
            <span className="h-7 flex-1 rounded-sm bg-surface-down" />
          </div>
          <span className="h-[18px] w-[62px] rounded-sm bg-primary-400/35" />
        </div>
        {/* Cursor, mid-click on the button the lit span produced. */}
        <svg viewBox="0 0 12 14" className="absolute left-[92px] top-[62px] w-3 text-white" aria-hidden>
          <path d="M1 1l10 6.5-4.4.9L4.3 13z" fill="currentColor" stroke="#111" strokeWidth="0.9" />
        </svg>
      </div>
    </div>

    <div className="relative mt-3 flex flex-col gap-[7px] pr-5">
      {SPANS.map((span, i) => (
        <div key={i} className="h-1.5 w-full">
          <div
            className={span.lit ? "h-full rounded-full bg-primary-400/70" : "h-full rounded-full bg-surface-up-4"}
            style={{ marginLeft: `${span.left}%`, width: `${span.width}%` }}
          />
        </div>
      ))}
      {/* One playhead for both: the panel's scrubber sets `sessionTime`. */}
      <span className="absolute -top-[108px] bottom-0 left-[36%] w-px bg-white/40" />
    </div>
  </div>
);

export default ScreenRecordingA;
