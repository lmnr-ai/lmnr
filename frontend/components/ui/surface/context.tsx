"use client";

import { createContext, useContext } from "react";

import { BASE_ELEVATION } from "./classes";

// Current elevation, MIN_ELEVATION (deepest sunken) .. MAX_ELEVATION (most elevated); BASE_ELEVATION is the page. React context (not CSS
// inheritance) so it survives Radix portals, which render overlay content at the
// document root — a portaled popover still reads the elevation it opened from.
// Elevations are levels; the raw color tokens they map to are the `surface-*` scale.
const ElevationContext = createContext<number>(BASE_ELEVATION);

/** The context provider under a friendly name. Bare, it only bumps the elevation NUMBER (no
 *  paint, no vars) — the low-level escape hatch for re-providing a level onto children of a node
 *  a library painted for you. For DOM you own, prefer `<ElevatedSurface>`. */
export const ElevationProvider = ElevationContext.Provider;

/** Raw elevation level from context. Internal — callers use `useElevation()`, which also returns
 *  the paint classes, or `<ElevatedSurface>` to paint + bump a subtree. */
export function useElevationContext(): number {
  return useContext(ElevationContext);
}
