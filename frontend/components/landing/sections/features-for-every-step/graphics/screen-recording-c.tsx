// Replay and span list share a playhead. Picking a span moves the video;
// scrubbing the video moves the list.
const SPANS = [
  { name: "goto(booking)", at: "00:00" },
  { name: "click(search)", at: "00:07" },
  { name: "chat.completion", at: "00:11", active: true },
  { name: "click(select)", at: "00:18" },
  { name: "fill(passenger)", at: "00:24" },
  { name: "click(confirm)", at: "00:31" },
];

const ScreenRecordingC = () => (
  <div className="absolute inset-0 overflow-hidden pl-5">
    <div className="overflow-hidden rounded-tl border-t border-l border-surface-350 bg-surface-100">
      <div className="flex items-center gap-1.5 border-b border-surface-350 bg-surface-200 px-2.5 py-[7px]">
        <span className="size-[5px] rounded-full bg-surface-450" />
        <span className="size-[5px] rounded-full bg-surface-450" />
        <span className="ml-1.5 rounded-sm bg-surface-300 px-1.5 py-[2px] font-mono text-[8px] text-foreground-500">
          flights.example.com
        </span>
      </div>
      <div className="relative flex gap-2 p-2.5">
        <div className="flex w-[42px] shrink-0 flex-col gap-1">
          <span className="h-1.5 w-full rounded-sm bg-surface-300" />
          <span className="h-1.5 w-[70%] rounded-sm bg-surface-300" />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <span className="h-2 w-[58%] rounded-sm bg-surface-400" />
          <div className="flex gap-1.5">
            <span className="h-7 flex-1 rounded-sm bg-surface-200" />
            <span className="h-7 flex-1 rounded-sm bg-surface-200" />
          </div>
        </div>
        {/* Click ripple where the active span touched the page. */}
        <span className="absolute left-[122px] top-[40px] size-6 rounded-full border border-primary-400/50" />
        <span className="absolute left-[129px] top-[47px] size-2.5 rounded-full bg-primary-400/60" />
      </div>
      <div className="relative mx-2.5 mb-2.5 h-1 rounded-full bg-surface-300">
        <span className="absolute inset-y-0 left-0 w-[36%] rounded-full bg-primary-400/70" />
        <span className="absolute -top-[3px] left-[36%] size-[7px] -translate-x-1/2 rounded-full bg-white" />
      </div>
    </div>

    <div className="mt-2 flex flex-col">
      {SPANS.map((span) => (
        <div
          key={span.name}
          className={
            span.active
              ? "flex items-center gap-2 rounded-l border-y border-l border-primary-400/30 bg-primary-400/[0.08] px-2.5 py-[7px]"
              : "flex items-center gap-2 px-2.5 py-[7px]"
          }
        >
          <span
            className={
              span.active
                ? "min-w-0 flex-1 truncate font-mono text-[10px] text-primary-200"
                : "min-w-0 flex-1 truncate font-mono text-[10px] text-foreground-500"
            }
          >
            {span.name}
          </span>
          <span className="shrink-0 font-mono text-[9px] text-foreground-600">{span.at}</span>
        </div>
      ))}
    </div>
  </div>
);

export default ScreenRecordingC;
