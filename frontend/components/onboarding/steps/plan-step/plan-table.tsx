"use client";

import { Check, Minus } from "lucide-react";

import PlanColumnHeader from "@/components/onboarding/steps/plan-step/plan-column-header";
import { COMPARISON_ROWS, type OnboardingTier, type PlanColumn } from "@/components/onboarding/steps/plan-step/plans";
import { cn } from "@/lib/utils";

interface PlanTableProps {
  columns: PlanColumn[];
  onSelect: (tier: OnboardingTier) => void;
}

type Edge = "top" | "middle" | "bottom";

// Inset shadows draw the selected column's outline inside the cells, so the ScrollArea can't clip it.
const SELECTED_EDGE: Record<Edge, string> = {
  top: "rounded-t-md shadow-[inset_1px_0_0_var(--color-primary),inset_-1px_0_0_var(--color-primary),inset_0_1px_0_var(--color-primary)]",
  middle: "shadow-[inset_1px_0_0_var(--color-primary),inset_-1px_0_0_var(--color-primary)]",
  bottom:
    "rounded-b-md shadow-[inset_1px_0_0_var(--color-primary),inset_-1px_0_0_var(--color-primary),inset_0_-1px_0_var(--color-primary)]",
};

const columnClass = (column: PlanColumn, edge: Edge) =>
  cn(
    "px-3 transition-colors",
    column.disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
    column.selected ? cn("bg-primary/5", SELECTED_EDGE[edge]) : !column.disabled && "hover:bg-surface-200"
  );

export default function PlanTable({ columns, onSelect }: PlanTableProps) {
  const select = (column: PlanColumn) => {
    if (!column.disabled) onSelect(column.plan.id);
  };
  const lastRow = COMPARISON_ROWS.length - 1;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] table-fixed border-separate border-spacing-0 text-[13px] xl:text-sm">
        <colgroup>
          <col className="w-[32%]" />
          {columns.map((column) => (
            <col key={column.plan.id} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th />
            {columns.map((column) => (
              <th
                key={column.plan.id}
                className={cn("pt-3 pb-2.5 align-bottom font-normal", columnClass(column, "top"))}
              >
                <PlanColumnHeader column={column} onSelect={() => select(column)} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {COMPARISON_ROWS.map((row, i) => (
            <tr key={row.label}>
              <td className="border-t border-surface-300/60 py-2 pr-3 text-foreground-300">{row.label}</td>
              {columns.map((column) => {
                const value = row.values[column.plan.id];
                return (
                  <td
                    key={column.plan.id}
                    className={cn(
                      "border-t border-surface-300/60 py-2 text-white",
                      columnClass(column, i === lastRow ? "bottom" : "middle")
                    )}
                    onClick={() => select(column)}
                  >
                    {value === true ? (
                      <Check className="size-3.5 text-foreground-50" strokeWidth={2.5} aria-label="Included" />
                    ) : value === false ? (
                      <Minus className="size-3.5 text-foreground-500" aria-label="Not included" />
                    ) : (
                      value
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
