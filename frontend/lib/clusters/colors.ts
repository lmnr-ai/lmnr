// Shared cluster color utilities. A cluster's color is purely a function of its
// id, so the same cluster shows the same color everywhere it's rendered
// (cluster list, stacked chart, trace-view signal panel, breadcrumbs).

// 100 colors sampled at equal intervals from a piecewise-linear curve through
// the original 17-color signal palette in HSL space (treated as a closed loop
// from red → ... → rose → red). Generated once via /tmp/gen-100-palette.mjs;
// edit by re-running the generator, not by hand.
export const CLUSTER_COLOR_PALETTE = [
  "#ef4444",
  "#f0493c",
  "#f24f35",
  "#f4572d",
  "#f55f25",
  "#f7691d",
  "#f97416",
  "#f87b14",
  "#f88212",
  "#f78910",
  "#f6910e",
  "#f6980c",
  "#f59f0a",
  "#f3a30a",
  "#f1a609",
  "#efaa09",
  "#edad09",
  "#ebb108",
  "#e8ba09",
  "#e3ce0b",
  "#dbde0e",
  "#c0d910",
  "#a7d413",
  "#90cf15",
  "#76cb17",
  "#59ca19",
  "#3dc91b",
  "#22c81d",
  "#1fc736",
  "#21c652",
  "#20c461",
  "#1dc267",
  "#1ac06d",
  "#17be73",
  "#14bc79",
  "#11ba7f",
  "#10b986",
  "#11b98c",
  "#12b992",
  "#13b899",
  "#13b89f",
  "#14b8a5",
  "#12bcaf",
  "#10c0bb",
  "#0ec3c5",
  "#0bbfca",
  "#09bbcf",
  "#06b6d4",
  "#07b4d7",
  "#08b1db",
  "#0aaedf",
  "#0babe2",
  "#0da8e6",
  "#0ea5ea",
  "#109ff1",
  "#1997f2",
  "#2291f3",
  "#2b8bf4",
  "#3486f5",
  "#3c81f6",
  "#437af5",
  "#4a74f4",
  "#516ff3",
  "#586bf2",
  "#5e68f1",
  "#6363f1",
  "#6961f2",
  "#7060f3",
  "#775ff4",
  "#7f5ef5",
  "#865df5",
  "#8d5cf6",
  "#925af6",
  "#9659f6",
  "#9b58f7",
  "#a057f7",
  "#a656f7",
  "#ac54f6",
  "#b451f5",
  "#bd4ef4",
  "#c54cf2",
  "#cd49f1",
  "#d647f0",
  "#e546ef",
  "#ee47e6",
  "#ee47d4",
  "#ed47c1",
  "#ed48af",
  "#ec489d",
  "#ed4792",
  "#ee4588",
  "#f0447f",
  "#f14275",
  "#f2416a",
  "#f43f5f",
  "#f3405a",
  "#f24155",
  "#f24151",
  "#f1424c",
  "#f04348",
];

// Fallback for the synthetic "Unclustered" bucket in the cluster list.
export const UNCLUSTERED_COLOR = "var(--color-primary)";

// FNV-1a. Stable across machines so the same cluster id always lands on the
// same palette index.
function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function getClusterColorById(id: string | null | undefined): string {
  if (!id) return CLUSTER_COLOR_PALETTE[0];
  return CLUSTER_COLOR_PALETTE[hashSeed(id) % CLUSTER_COLOR_PALETTE.length];
}

export function withOpacity(color: string, opacity: number): string {
  return `color-mix(in srgb, ${color} ${Math.round(opacity * 100)}%, transparent)`;
}
