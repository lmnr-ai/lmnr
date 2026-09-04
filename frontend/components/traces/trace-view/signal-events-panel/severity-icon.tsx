"use client";

import { CircleAlert, Info, TriangleAlert } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SEVERITY_LABELS } from "@/lib/actions/alerts/types";
import { cn } from "@/lib/utils";

const ICONS = { 0: Info, 1: TriangleAlert, 2: CircleAlert } as const;

const COLORS: Record<number, string> = {
  0: "text-muted-foreground/60",
  1: "text-orange-400/80",
  2: "text-red-400",
};

/**
 * Severity as a glyph beside the signal name.
 *
 * A word up here would be a second title competing with the signal's own name,
 * so the label lives in a tooltip — a colour and a shape are a convention, and
 * conventions have to be learnable.
 *
 * The size is a CLASS, not lucide's `size` prop: `size` becomes a width/height
 * attribute, which loses to `TabsTrigger`'s `[&_svg:not([class*='size-'])]:size-4`
 * and pins every glyph inside a tab to 16px.
 */
export default function SeverityIcon({ severity, bare }: { severity: number; bare?: boolean }) {
  const Icon = ICONS[severity as keyof typeof ICONS] ?? Info;
  const label = SEVERITY_LABELS[severity as keyof typeof SEVERITY_LABELS] ?? "Info";
  const color = COLORS[severity] ?? COLORS[0];

  // Inside a signal TAB the glyph sits within a button, where a tooltip trigger
  // would both nest interactive elements and compete with the tab for the click.
  // The tab's label already names the signal, so the glyph keeps only its label.
  if (bare) {
    return (
      <span className={cn("pointer-events-none shrink-0", color)} aria-label={label}>
        <Icon className="size-3" />
      </span>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={color} aria-label={label}>
          <Icon className="size-3 shrink-0" />
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
