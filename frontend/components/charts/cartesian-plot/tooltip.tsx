import { ElevatedSurface } from "@/components/ui/surface";

import { type PlotTooltipProps } from "./types";

const MAX_ROWS_WITH_ZEROS = 6;

/** The default tooltip; callers can replace only its content, not chart hit-testing or positioning. */
export default function PlotTooltip({ label, items }: PlotTooltipProps) {
  const visible = items.length > MAX_ROWS_WITH_ZEROS ? items.filter((item) => item.value !== 0) : items;
  return (
    <ElevatedSurface
      offset={3}
      className="grid min-w-32 items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-md"
    >
      <div className="font-medium">{label}</div>
      <div className="grid gap-1.5">
        {visible.map((item) => (
          <div key={item.key} className="flex w-full items-center gap-2">
            {item.icon ?? <div className="size-2.5 shrink-0 rounded-[2px]" style={{ background: item.color }} />}
            <div className="flex flex-1 items-center justify-between gap-2 leading-none">
              <span className="text-muted-foreground">{item.label}</span>
              <span className="shrink-0 font-mono font-medium tabular-nums text-foreground">
                {item.value.toLocaleString()}
              </span>
            </div>
          </div>
        ))}
      </div>
    </ElevatedSurface>
  );
}
