export { MAX_ELEVATION, MIN_ELEVATION, SURFACE_BG, surfaceClasses, surfaceVars } from "./classes";
// ElevationProvider is the low-level escape hatch (bare context — no paint, no vars). Prefer
// <ElevatedSurface> for DOM you own; reach for the provider only to re-provide a level onto
// children of a node a library painted for you.
export { ElevationProvider } from "./context";
export { ElevatedSurface } from "./elevated-surface";
export { type ElevatedSurfaceProps, type ElevationConfig } from "./types";
export { useElevation } from "./use-elevation";
