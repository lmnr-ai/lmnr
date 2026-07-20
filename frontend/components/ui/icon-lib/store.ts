"use client";

// TEMPORARY icon-library prototyping store — session-only, no persistence.
// Paired with the generated ./index.tsx wrapper and the style-explorer control.
// Safe to delete this folder once the icon-library comparison is done.

import { useSyncExternalStore } from "react";

export type IconLib = "lucide" | "tabler" | "phosphor" | "hugeicons" | "remix";

export const ICON_LIBS: IconLib[] = ["lucide", "tabler", "phosphor", "hugeicons", "remix"];

// Iconify set prefix per library ("lucide" never goes through Iconify — see index.tsx).
export const ICONIFY_PREFIX: Record<Exclude<IconLib, "lucide">, string> = {
  tabler: "tabler",
  phosphor: "ph",
  hugeicons: "hugeicons",
  remix: "ri",
};

let current: IconLib = "lucide";
// Global default icon stroke width (lucide's native default is 2). Per-call
// strokeWidth props still win; the wrapper falls back to this when none is passed.
export const DEFAULT_ICON_STROKE = 2;
let stroke = DEFAULT_ICON_STROKE;
const listeners = new Set<() => void>();

export function getIconLib(): IconLib {
  return current;
}

export function setIconLib(lib: IconLib): void {
  if (lib === current) return;
  current = lib;
  listeners.forEach((l) => l());
}

export function getIconStroke(): number {
  return stroke;
}

export function setIconStroke(next: number): void {
  if (next === stroke) return;
  stroke = next;
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// Server snapshot is always "lucide" so SSR + first client paint match the
// current app; switching happens client-side only.
export function useIconLib(): IconLib {
  return useSyncExternalStore(subscribe, getIconLib, () => "lucide");
}

export function useIconStroke(): number {
  return useSyncExternalStore(subscribe, getIconStroke, () => DEFAULT_ICON_STROKE);
}
