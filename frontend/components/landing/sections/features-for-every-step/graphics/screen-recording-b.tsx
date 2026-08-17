// A filmstrip down the card. The URL is what the player shows above the replay,
// and it changes as the run navigates, so each frame is stamped with both.
const FRAMES = [
  { at: "00:02", url: "flights.example.com/search" },
  { at: "00:11", url: "flights.example.com/offer/48", active: true },
  { at: "00:24", url: "flights.example.com/checkout" },
];

const ScreenRecordingB = () => (
  <div className="absolute inset-0 overflow-hidden pl-[22px]">
    <div className="flex flex-col gap-2.5">
      {FRAMES.map((frame) => (
        <div key={frame.at} className="flex gap-2.5">
          <span className="w-[30px] shrink-0 pt-1 text-right font-mono text-[9px] text-foreground-500">{frame.at}</span>
          <div
            className={
              frame.active
                ? "flex-1 overflow-hidden rounded-tl border-t border-l border-primary-400/40 bg-surface-down-3"
                : "flex-1 overflow-hidden rounded-tl border-t border-l border-surface-up-2 bg-surface-down-3"
            }
          >
            <p className="truncate border-b border-surface-up-2 bg-surface-down px-2 py-1.5 font-mono text-[8px] text-foreground-500">
              {frame.url}
            </p>
            <div className="flex gap-1.5 p-2">
              <div className="flex w-[34px] shrink-0 flex-col gap-1">
                <span className="h-1 w-full rounded-sm bg-surface-up" />
                <span className="h-1 w-[70%] rounded-sm bg-surface-up" />
              </div>
              <div className="flex flex-1 flex-col gap-1">
                <span className="h-1.5 w-[62%] rounded-sm bg-surface-up-3" />
                <span className="h-1.5 w-[88%] rounded-sm bg-surface-up" />
                <span
                  className={
                    frame.active ? "h-3 w-[52px] rounded-sm bg-primary-400/35" : "h-3 w-[52px] rounded-sm bg-surface-up"
                  }
                />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>

    {/* The player's scrubber, parked on the lit frame. */}
    <div className="relative ml-[40px] mr-5 mt-3.5 h-[3px] rounded-full bg-surface-up-3">
      <span className="absolute inset-y-0 left-0 w-[36%] rounded-full bg-white/70" />
      <span className="absolute -top-[2px] left-[36%] size-[7px] -translate-x-1/2 rounded-full bg-white" />
    </div>
    <p className="ml-[40px] mt-2.5 font-mono text-[9px] text-foreground-500">00:11 / 00:31</p>
  </div>
);

export default ScreenRecordingB;
