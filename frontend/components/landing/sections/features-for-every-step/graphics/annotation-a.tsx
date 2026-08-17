import { Check, ChevronLeft, ChevronRight, Database, RotateCcw, Trash2 } from "lucide-react";

// The labeling queue: the datapoint's data on the left of the split, the target
// you edit on the right, and the queue's own controls under it.
const AnnotationA = () => (
  <div className="absolute inset-0 overflow-hidden pl-[22px]">
    <div className="rounded-tl border-t border-l border-surface-up-2 bg-surface-down">
      <p className="border-b border-surface-up-2 px-3 py-1.5 text-[10px] text-foreground-500">data</p>
      <p className="px-3 py-2.5 pr-6 text-[11px] leading-4 text-foreground-200">
        Booked <span className="text-white">NRT</span>, departing Mar 4. Never checked the return leg.
      </p>
    </div>

    <div className="mt-2 rounded-tl border-t border-l border-surface-up-2 bg-surface-down">
      <p className="border-b border-surface-up-2 px-3 py-1.5 text-[10px] text-foreground-500">target</p>
      <div className="px-3 py-2.5 font-mono text-[10px] leading-4 text-foreground-300">
        <p>{"{"}</p>
        <p className="pl-3">
          <span className="text-foreground-500">&quot;verdict&quot;:</span>{" "}
          <span className="text-primary-200">&quot;incomplete&quot;</span>
        </p>
        <p>{"}"}</p>
      </div>
    </div>

    {/* The queue's bottom controls, in their real order. */}
    <div className="mt-3 flex items-center gap-2 rounded-l border-y border-l border-surface-up-2 bg-surface-down px-2 py-1.5">
      <ChevronLeft className="size-3 text-foreground-500" strokeWidth={1.75} />
      <span className="text-[10px] text-foreground-400">
        Item <span className="text-white">18</span> of 240
      </span>
      <ChevronRight className="size-3 text-foreground-500" strokeWidth={1.75} />
      <span className="ml-1 h-3.5 w-px bg-surface-up-3" />
      <Check className="size-3 text-green-400" strokeWidth={2} />
      <RotateCcw className="size-3 text-foreground-500" strokeWidth={1.75} />
      <Trash2 className="size-3 text-foreground-500" strokeWidth={1.75} />
    </div>

    <div className="mt-2 inline-flex items-center gap-1.5 rounded border border-surface-up-3 px-2 py-1">
      <Database className="size-3 text-foreground-400" strokeWidth={1.75} />
      <span className="text-[10px] text-foreground-300">Push to dataset</span>
    </div>
  </div>
);

export default AnnotationA;
