import { Play } from "lucide-react";

// The replay player alone. It used to sit under four transcript rows, which
// pushed the browser frame down the band and left the one thing a reader has to
// recognise — a recorded page — as the smallest part of the graphic.
const ScreenRecording = () => (
  <div className="absolute inset-0 overflow-hidden">
    <div className="rounded-tl border-t border-l border-surface-up-2 bg-surface-down">
      <div className="flex items-center gap-2 border-b border-surface-up-2 px-2.5 py-[6px]">
        <Play className="size-3 shrink-0 fill-current text-foreground-200" strokeWidth={0} />
        <span className="shrink-0 text-[10px] text-foreground-400">1x</span>
        <span className="relative h-[3px] flex-1 rounded-full bg-surface-up-3">
          <span className="absolute inset-y-0 left-0 w-[36%] rounded-full bg-white/70" />
          <span className="absolute -top-[2px] left-[36%] size-[7px] -translate-x-1/2 rounded-full bg-white" />
        </span>
        <span className="shrink-0 font-mono text-[9px] text-foreground-400">00:11/00:31</span>
      </div>
      <p className="truncate border-b border-surface-up-2 px-2.5 py-1.5 font-mono text-[9px] text-foreground-500">
        flights.example.com/offer/48
      </p>
      {/* The replayed page. Deliberately the tallest thing in the band: it is
          the one part a reader has to recognise as a browser. */}
      <div className="flex gap-2 bg-surface-down-3 p-2.5">
        <div className="flex w-[40px] shrink-0 flex-col gap-1.5">
          <span className="h-1.5 w-full rounded-sm bg-surface-up" />
          <span className="h-1.5 w-[70%] rounded-sm bg-surface-up" />
          <span className="h-1.5 w-[85%] rounded-sm bg-surface-up" />
          <span className="h-1.5 w-[60%] rounded-sm bg-surface-up" />
          <span className="h-1.5 w-[78%] rounded-sm bg-surface-up" />
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <span className="h-2 w-[58%] rounded-sm bg-surface-up-3" />
          <div className="flex gap-1.5">
            <span className="h-[46px] flex-1 rounded-sm bg-surface-down" />
            <span className="h-[46px] flex-1 rounded-sm bg-surface-down" />
          </div>
          <span className="h-1.5 w-[80%] rounded-sm bg-surface-up" />
          <span className="h-1.5 w-[64%] rounded-sm bg-surface-up" />
          <span className="h-5 w-[64px] rounded-sm bg-surface-up-3" />
          <span className="h-1.5 w-[72%] rounded-sm bg-surface-up" />
          <span className="h-1.5 w-[55%] rounded-sm bg-surface-up" />
        </div>
      </div>
    </div>
  </div>
);

export default ScreenRecording;
