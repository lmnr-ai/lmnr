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

interface Props {
  severity: number;
  /** Skip the tooltip. Inside a tab it would nest interactive elements and
   *  compete for the click, and the tab's own label already names the signal. */
  bare?: boolean;
}

/** Severity beside the signal name. A word there would be a second title, so the
 *  label lives in a tooltip — a colour and a shape have to be learnable. */
export default function SeverityIcon({ severity, bare }: Props) {
  const Icon = ICONS[severity as keyof typeof ICONS] ?? Info;
  const label = SEVERITY_LABELS[severity as keyof typeof SEVERITY_LABELS] ?? "Info";

  // Sized by CLASS: lucide's `size` prop becomes an attribute, which loses to
  // `TabsTrigger`'s `[&_svg:not([class*='size-'])]:size-4`.
  const glyph = (
    <span className={cn("shrink-0", COLORS[severity] ?? COLORS[0], bare && "pointer-events-none")} aria-label={label}>
      <Icon className="size-3" />
    </span>
  );

  if (bare) return glyph;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{glyph}</TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
