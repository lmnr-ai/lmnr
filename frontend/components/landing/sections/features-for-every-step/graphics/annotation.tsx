import { Check, Circle, Pencil } from "lucide-react";

// The queue navigator over the labelling form: one segment per item, then the
// schema's dimensions with the number key that picks each option. Everything
// here paints ABOVE the card's surface — a darker pill reads as a hole.
const TOTAL = 64;
const APPROVED = 24;
const MODIFIED = 7;
const CURRENT = 34;

const VERDICTS = [
  { label: "correct", key: 1 },
  { label: "partial", key: 2 },
  { label: "wrong", key: 3, selected: true },
];

const segmentTone = (i: number) => {
  if (i < APPROVED) return "bg-success-bright";
  if (i < APPROVED + MODIFIED) return "bg-amber-500";
  return "bg-muted-foreground/30";
};

const FieldKey = ({ children }: { children: string }) => (
  <span className="rounded bg-primary-400/15 px-1.5 py-px font-mono text-[9px] text-primary-200">{children}</span>
);

const Annotation = () => (
  <div className="absolute inset-0 overflow-hidden">
    {/* Wider than the card on purpose: the queue runs off the edge, which is
        what a 240-item queue looks like. */}
    <div className="relative h-[5px] w-[190%]">
      <div className="flex h-[5px] w-full gap-px overflow-hidden rounded-sm bg-surface-up-2">
        {Array.from({ length: TOTAL }, (_, i) => (
          <div key={i} className={`h-full flex-1 ${segmentTone(i)}`} />
        ))}
      </div>
      <div
        className="absolute -bottom-[3px] -top-[3px] rounded-sm border border-foreground-300 bg-white/10"
        style={{ left: `${((CURRENT - 1) / TOTAL) * 100}%`, width: `${(1 / TOTAL) * 100}%` }}
      />
    </div>

    <div className="pr-5">
      <div className="mt-3 flex items-center gap-2.5 text-[10px] tabular-nums text-foreground-400">
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

    {/* Negative right margin so the field cards run past the card's edge. */}
    <div className="-mr-4 mt-3.5 flex flex-col gap-2">
      <div className="rounded-lg bg-surface-up p-2.5">
        <div className="flex items-center gap-1.5">
          <FieldKey>verdict</FieldKey>
          <span className="truncate text-[10px] text-foreground-200">Did the run finish the task?</span>
        </div>
        <div className="mt-2.5 flex gap-1.5">
          {VERDICTS.map((verdict) => (
            <span
              key={verdict.label}
              className={
                verdict.selected
                  ? "inline-flex flex-1 items-center justify-center gap-1.5 rounded bg-white/5 px-2.5 py-1.5 text-[10px] text-white"
                  : "inline-flex flex-1 items-center justify-center gap-1.5 rounded bg-white/[0.02] px-2.5 py-1.5 text-[10px] text-foreground-200"
              }
            >
              {verdict.label}
              <span
                className={
                  verdict.selected
                    ? "rounded bg-white/15 px-1 text-[9px] text-white"
                    : "rounded bg-white/[0.07] px-1 text-[9px] text-foreground-400"
                }
              >
                {verdict.key}
              </span>
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-lg bg-surface-up p-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <FieldKey>severity</FieldKey>
            <span className="truncate text-[10px] text-foreground-300">How bad</span>
          </div>
          <span className="shrink-0 text-[9px] italic text-foreground-500">Not labelled</span>
        </div>
        <div className="mt-3 h-1 rounded-full bg-surface-up-4">
          <span className="block h-full w-[40%] rounded-full bg-foreground-300" />
        </div>
      </div>

      <div className="rounded-lg bg-surface-up p-2.5">
        <div className="flex items-center gap-1.5">
          <FieldKey>note</FieldKey>
          <span className="truncate text-[10px] text-foreground-300">Anything else</span>
        </div>
        <div className="mt-2.5 rounded bg-surface-up-3 px-2 py-1.5 text-[10px] text-foreground-500">Input text...</div>
      </div>
    </div>
  </div>
);

export default Annotation;
