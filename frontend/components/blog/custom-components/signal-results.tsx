import { type ReactNode } from "react";

import { cn } from "@/lib/utils";

import WarningMark from "./signals-pipeline/warning-mark";

// `triangle` matches the issue-triangle colours in the MultiModelPipeline graph
// so the badge reads as the same mark, tying each card back to the diagram.
const GRADES = {
  caught: { label: "Caught it", className: "bg-emerald-400/10 text-emerald-300", triangle: "#34d399" },
  partial: { label: "Partial", className: "bg-yellow-400/10 text-yellow-300", triangle: "#facc15" },
  missed: { label: "Missed it", className: "bg-red-400/10 text-red-300", triangle: "#f87171" },
  noise: { label: "False alarm", className: "bg-orange-400/10 text-orange-300", triangle: "#fb923c" },
} as const;

export function SignalResults({ children }: { children: ReactNode }) {
  return (
    <div className="not-typeset my-6 overflow-hidden rounded-lg border border-white/10">
      <div className="flex flex-col divide-y divide-white/10">{children}</div>
    </div>
  );
}

// The ground truth the model outputs below are graded against; goes first inside SignalResults.
export function ActualIssue({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 border-l-2 border-l-emerald-400 bg-emerald-400/[0.07] px-4 py-3">
      <span className="text-xs font-medium text-emerald-300">Actual issue</span>
      <div className="text-sm leading-relaxed text-white [&_p]:m-0">{children}</div>
    </div>
  );
}

interface SignalEventProps {
  model: string;
  grade?: keyof typeof GRADES;
  highlight?: string;
  children?: ReactNode;
}

export function SignalEvent({ model, grade, highlight, children }: SignalEventProps) {
  const gradeStyle = grade ? GRADES[grade] : undefined;
  return (
    <div className={cn("flex flex-col gap-2 px-4 py-3", highlight === "true" && "bg-[#8fbbfe]/[0.07]")}>
      <div className="flex items-center gap-2">
        {gradeStyle && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium",
              gradeStyle.className
            )}
          >
            <WarningMark color={gradeStyle.triangle} />
            {gradeStyle.label}
          </span>
        )}
        <span className={cn("text-sm font-medium", highlight === "true" ? "text-[#8fbbfe]" : "text-white")}>
          {model}
        </span>
      </div>
      <div className="text-sm leading-relaxed text-secondary-foreground [&_p]:m-0">
        {children ?? <span className="italic">No event: no failure found.</span>}
      </div>
    </div>
  );
}
