import { type ColumnDef } from "@tanstack/react-table";

import { type EvalRow } from "@/lib/evaluation/types";

// Width breakpoints (px) for the morphing datapoint panel: card list below the
// first, progressively more columns above it.
const CARD_MAX_WIDTH = 400;
const MINIMAL_MAX_WIDTH = 600;
const ESSENTIALS_MAX_WIDTH = 900;

export type MorphTier = "card" | "minimal" | "essentials" | "full";

export function tierForWidth(width: number): MorphTier {
  if (width < CARD_MAX_WIDTH) return "card";
  if (width < MINIMAL_MAX_WIDTH) return "minimal";
  if (width < ESSENTIALS_MAX_WIDTH) return "essentials";
  return "full";
}

export function tierLabel(tier: MorphTier): string {
  if (tier === "card") return "Card view";
  if (tier === "minimal") return "Compact table";
  if (tier === "essentials") return "Essentials table";
  return "Full table";
}

const BASE_TIER_IDS = ["status", "index", "data"];

/** Column subset for a tier. Undefined ("full") means the caller's default set. */
export function columnsForTier(
  columnDefs: ColumnDef<EvalRow>[],
  tier: MorphTier,
  selectedScore: string | undefined
): ColumnDef<EvalRow>[] | undefined {
  if (tier === "essentials") {
    return columnDefs.filter((c) => BASE_TIER_IDS.includes(c.id!) || c.id?.startsWith("score:"));
  }
  if (tier === "minimal") {
    const ids = selectedScore ? [...BASE_TIER_IDS, `score:${selectedScore}`] : BASE_TIER_IDS;
    return columnDefs.filter((c) => ids.includes(c.id!));
  }
  return undefined;
}
