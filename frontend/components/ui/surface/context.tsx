"use client";

import { createContext, type ReactNode, useContext } from "react";

// Current elevation, 1 (base plane) .. 8 (most elevated). React context (not CSS
// inheritance) so it survives Radix portals, which render overlay content at the
// document root — a portaled popover still reads the elevation it opened from.
// Elevations are levels; the raw color tokens they map to are the `surface-*` scale.
const ElevationContext = createContext<number>(1);

export const MIN_ELEVATION = 1;
export const MAX_ELEVATION = 8;

export function useElevation(): number {
  return useContext(ElevationContext);
}

export function ElevationProvider({ value, children }: { value: number; children: ReactNode }) {
  return (
    <ElevationContext.Provider value={Math.max(MIN_ELEVATION, Math.min(MAX_ELEVATION, value))}>
      {children}
    </ElevationContext.Provider>
  );
}
