// A filmstrip down the card. Each frame is stamped with the moment in the run
// it came from, so a browser step and a span share one clock.
const FRAMES = [
  { at: "00:02", label: "search results" },
  { at: "00:11", label: "offer selected", active: true },
  { at: "00:24", label: "checkout form" },
];

const ScreenRecordingB = () => (
  <div className="absolute inset-0 overflow-hidden pl-5">
    <div className="flex flex-col gap-2.5">
      {FRAMES.map((frame) => (
        <div key={frame.at} className="flex gap-2.5">
          <span className="w-[30px] shrink-0 pt-1 text-right font-mono text-[9px] text-foreground-500">{frame.at}</span>
          <div
            className={
              frame.active
                ? "flex-1 overflow-hidden rounded-tl border-t border-l border-primary-400/40 bg-surface-100"
                : "flex-1 overflow-hidden rounded-tl border-t border-l border-surface-350 bg-surface-100"
            }
          >
            <div className="flex items-center gap-1 border-b border-surface-350 bg-surface-200 px-2 py-1.5">
              <span className="size-1 rounded-full bg-surface-450" />
              <span className="size-1 rounded-full bg-surface-450" />
              <span className="ml-1 truncate font-mono text-[8px] text-foreground-600">{frame.label}</span>
            </div>
            <div className="flex gap-1.5 p-2">
              <div className="flex w-[34px] shrink-0 flex-col gap-1">
                <span className="h-1 w-full rounded-sm bg-surface-300" />
                <span className="h-1 w-[70%] rounded-sm bg-surface-300" />
              </div>
              <div className="flex flex-1 flex-col gap-1">
                <span className="h-1.5 w-[62%] rounded-sm bg-surface-400" />
                <span className="h-1.5 w-[88%] rounded-sm bg-surface-300" />
                <span
                  className={
                    frame.active
                      ? "h-3 w-[52px] rounded-sm bg-primary-400/35"
                      : "h-3 w-[52px] rounded-sm bg-surface-300"
                  }
                />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>

    {/* Scrub bar, parked on the lit frame. */}
    <div className="relative ml-[40px] mr-5 mt-3.5 h-1 rounded-full bg-surface-350">
      <span className="absolute inset-y-0 left-0 w-[46%] rounded-full bg-primary-400/70" />
      <span className="absolute -top-[3px] left-[46%] size-[7px] -translate-x-1/2 rounded-full bg-white" />
    </div>
    <p className="ml-[40px] mt-2 font-mono text-[9px] text-foreground-500">00:11 / 00:38</p>
  </div>
);

export default ScreenRecordingB;
