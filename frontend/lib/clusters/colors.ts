import { CATEGORICAL_COLOR_PALETTE } from "@/lib/colors";

// Cluster color = a pure function of the cluster id, so the same cluster shows
// the same color everywhere (cluster list, stacked chart, trace-view signal
// panel, breadcrumbs). Draws from the shared categorical palette.

// Fallback for the synthetic "Unclustered" bucket in the cluster list.
export const UNCLUSTERED_COLOR = "var(--color-primary)";

// Bump to shift every cluster's color into a different palette slot.
// Stays under FNV's seed (a u32) so the hash domain doesn't degenerate.
const HASH_SALT = "v4";

// FNV-1a. Stable across machines so the same cluster id always lands on the
// same palette index (for a given HASH_SALT).
function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function getClusterColorById(id: string | null | undefined): string {
  if (!id) return CATEGORICAL_COLOR_PALETTE[0];
  return CATEGORICAL_COLOR_PALETTE[hashSeed(HASH_SALT + id) % CATEGORICAL_COLOR_PALETTE.length];
}

export function withOpacity(color: string, opacity: number): string {
  return `color-mix(in srgb, ${color} ${Math.round(opacity * 100)}%, transparent)`;
}
