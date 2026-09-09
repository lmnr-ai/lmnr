/** Cluster color for emails. MUST stay bit-identical to
 *  `frontend/lib/clusters/colors.ts` and to the Rust port in
 *  `app-server/src/notifications/`. See CLUSTER_COLOR_VECTORS for the
 *  cross-language assertions.
 *
 *  Note for the Rust port: `Math.imul` is a wrapping 32-bit multiply
 *  (`wrapping_mul` on u32), and `charCodeAt` yields UTF-16 code units, not
 *  bytes. Cluster ids are ASCII UUIDs so `bytes()` agrees, but non-ASCII
 *  input would diverge. */
import { CATEGORICAL_COLOR_PALETTE } from "@/lib/colors";

const HASH_SALT = "v4";

// FNV-1a, 32-bit.
export function hashSeed(seed: string): number {
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

/** Golden test vectors. Assert these in the Rust unit test verbatim. */
export const CLUSTER_COLOR_VECTORS: ReadonlyArray<{ id: string; hash: number; color: string }> = [
  { id: "abc", hash: 2654589193, color: "#f2416a" },
  { id: "550e8400-e29b-41d4-a716-446655440000", hash: 843809330, color: "#20c461" },
  { id: "7f3a1c22-0000-4000-8000-000000000001", hash: 2838285401, color: "#f0493c" },
];
