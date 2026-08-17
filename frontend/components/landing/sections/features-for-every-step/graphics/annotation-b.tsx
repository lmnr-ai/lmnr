import { Check, ChevronLeft, ChevronRight, Circle, Pencil, Trash2 } from "lucide-react";

// The queue navigator: one segment per item, coloured by state, with the
// current item boxed and the three state counts beside it. Scrubbing it jumps
// the queue, which is why "fast" is the claim.
const TOTAL = 34;
const APPROVED = 17;
const MODIFIED = 4;
const CURRENT = 18;

const segmentTone = (i: number) => {
  if (i < APPROVED) return "bg-success-bright";
  if (i < APPROVED + MODIFIED) return "bg-amber-500";
  return "bg-muted-foreground/30";
};

const AnnotationB = () => (
  <div className="absolute inset-0 overflow-hidden pl-[22px]">
    <div className="pr-5">
      <div className="relative h-2.5">
        <div className="flex h-2.5 w-full gap-px overflow-hidden rounded-sm bg-surface-up-2">
          {Array.from({ length: TOTAL }, (_, i) => (
            <div key={i} className={`h-full flex-1 ${segmentTone(i)}`} />
          ))}
        </div>
        {/* The cursor sitting on the item under review. */}
        <div
          className="absolute -bottom-0.5 -top-0.5 rounded-sm border border-foreground-300 bg-white/10"
          style={{ left: `${((CURRENT - 1) / TOTAL) * 100}%`, width: `${(1 / TOTAL) * 100}%` }}
        />
      </div>

      <div className="mt-2.5 flex items-center gap-2.5 text-[10px] tabular-nums text-foreground-400">
        <span className="inline-flex items-center gap-1">
          <Circle className="size-2.5 text-foreground-500" />
          {TOTAL - APPROVED - MODIFIED}
        </span>
        <span className="inline-flex items-center gap-1">
          <Pencil className="size-2.5 text-amber-500" />
          {MODIFIED}
        </span>
        <span className="inline-flex items-center gap-1">
          <Check className="size-2.5 text-success-bright" />
          {APPROVED}
        </span>
      </div>
    </div>

    <div className="mt-3.5 rounded-tl border-t border-l border-surface-up-2 bg-surface-down">
      <div className="flex items-center gap-2 border-b border-surface-up-2 px-2.5 py-1.5">
        <ChevronLeft className="size-3 text-foreground-500" strokeWidth={1.75} />
        <span className="text-[10px] text-foreground-400">
          Item <span className="text-white">{CURRENT}</span> of {TOTAL}
        </span>
        <ChevronRight className="size-3 text-foreground-500" strokeWidth={1.75} />
      </div>
      <p className="px-2.5 py-2.5 pr-6 text-[11px] leading-4 text-foreground-200">
        Booked <span className="text-white">NRT</span>, departing Mar 4. Never checked the return leg.
      </p>
      <div className="flex items-center gap-2 border-t border-surface-up-2 px-2.5 py-2">
        <span className="inline-flex items-center gap-1 rounded border border-success-bright/40 bg-success-bright/10 px-1.5 py-[3px] text-[9px] text-success-bright">
          <Check className="size-2.5" strokeWidth={2.5} />
          Approve
        </span>
        <span className="font-mono text-[9px] text-foreground-600">⌘ ↵</span>
        <span className="ml-auto inline-flex items-center gap-1 rounded border border-surface-up-3 px-1.5 py-[3px] text-[9px] text-foreground-400">
          <Trash2 className="size-2.5" strokeWidth={1.75} />
          Discard
        </span>
      </div>
    </div>

    <p className="mt-2.5 truncate rounded-tl border-t border-l border-surface-up-2 bg-surface-down/60 px-2.5 py-2.5 pr-6 text-[11px] text-foreground-500">
      Cancelled the wrong leg and rebooked at a higher fare.
    </p>
  </div>
);

export default AnnotationB;
