import { Check, Minus, X } from "lucide-react";

import { cn } from "@/lib/utils";

const GRADES = {
  caught: { label: "Caught it", icon: Check, className: "bg-emerald-400/15 text-emerald-300" },
  partial: { label: "Partial", icon: Minus, className: "bg-yellow-400/15 text-yellow-300" },
  missed: { label: "Missed it", icon: X, className: "bg-red-400/15 text-red-300" },
  noise: { label: "False alarm", icon: X, className: "bg-red-400/15 text-red-300" },
} as const;

// Inline so it can sit in a markdown table cell: `| <Grade value="caught" /> |`.
// With `label`, renders the legend form (icon + text) instead of the icon-only cell.
export default function Grade({ value, label }: { value: keyof typeof GRADES; label?: string }) {
  const grade = GRADES[value];
  if (!grade) return null;
  const Icon = grade.icon;
  return (
    <span className={cn("not-typeset inline-flex items-center gap-1.5 align-middle", label && "mr-4")}>
      <span
        title={grade.label}
        className={cn("inline-flex size-6 items-center justify-center rounded", grade.className)}
      >
        <Icon className="size-3.5" />
      </span>
      {label && <span className="text-xs text-secondary-foreground">{label}</span>}
    </span>
  );
}
