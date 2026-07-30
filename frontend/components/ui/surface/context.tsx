"use client";

import { createContext, type ReactNode, useContext } from "react";

// The current substrate level, 1 (base plane) .. 8 (most elevated). React context
// (not CSS inheritance) so it survives Radix portals, which render overlay content
// at the document root — a portaled popover still reads the level of the surface it
// opened from.
const SurfaceContext = createContext<number>(1);

export const MIN_SURFACE = 1;
export const MAX_SURFACE = 8;

export function useSurface(): number {
  return useContext(SurfaceContext);
}

export function SurfaceProvider({ value, children }: { value: number; children: ReactNode }) {
  return (
    <SurfaceContext.Provider value={Math.max(MIN_SURFACE, Math.min(MAX_SURFACE, value))}>
      {children}
    </SurfaceContext.Provider>
  );
}
