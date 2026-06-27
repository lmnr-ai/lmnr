"use client";

// TEMPORARY style exploration tooling — safe to delete this folder + the mount in layout.tsx.
// Holds the full editable theme state and live-applies it to document.documentElement via
// inline custom-property overrides. Does NOT persist anywhere.

import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from "react";

import {
  BINDING_KEYS,
  BINDINGS_SEED,
  computeSurfaceColor,
  type CurveKey,
  DEFAULT_ENDPOINTS,
  FOREGROUND_KEYS,
  HSL_KEYS,
  HSL_SEED,
  initialForegroundPoints,
  initialPoints,
  OKLCH_SEED,
  SURFACE_KEYS,
  type SurfaceEndpoints,
  type SurfacePoint,
} from "./tokens";

const STORAGE_KEY = "lmnr-style-explorer-v1";

// Every custom property the panel can write — used to fully clear overrides on reset.
const MANAGED_PROPERTIES: string[] = [
  ...SURFACE_KEYS.map((k) => `--color-${k}`),
  ...FOREGROUND_KEYS.map((k) => `--color-${k}`),
  ...Object.keys(OKLCH_SEED),
  ...HSL_KEYS,
  ...BINDING_KEYS.map((t) => `--color-${t}`),
];

interface Curve {
  endpoints: SurfaceEndpoints;
  points: SurfacePoint[];
}

export interface StyleState {
  version: 1;
  surfaceCurve: Curve;
  foregroundCurve: Curve;
  oklch: Record<string, string>;
  hsl: Record<string, string>;
  bindings: Record<string, string>; // semantic token -> ramp stop key
}

function freshState(): StyleState {
  return {
    version: 1,
    surfaceCurve: { endpoints: { ...DEFAULT_ENDPOINTS }, points: initialPoints() },
    foregroundCurve: { endpoints: { ...DEFAULT_ENDPOINTS }, points: initialForegroundPoints() },
    oklch: { ...OKLCH_SEED },
    hsl: { ...HSL_SEED },
    bindings: { ...BINDINGS_SEED },
  };
}

interface StyleContextValue {
  state: StyleState;
  setPoint: (curve: CurveKey, key: string, t: number, l: number) => void;
  setEndpoint: (curve: CurveKey, which: keyof SurfaceEndpoints, value: number) => void;
  interpolatePoints: (curve: CurveKey) => void;
  setOklch: (varName: string, value: string) => void;
  setHsl: (varName: string, value: string) => void;
  setBinding: (token: string, stop: string) => void;
  replaceState: (next: StyleState) => void;
  applyToDocument: () => void;
  resetAll: () => void;
  toJSON: () => string;
  fromJSON: (raw: string) => void;
}

const StyleContext = createContext<StyleContextValue | null>(null);

export function useStyleContext(): StyleContextValue {
  const ctx = useContext(StyleContext);
  if (!ctx) throw new Error("useStyleContext must be used within <StyleProvider>");
  return ctx;
}

function applyState(state: StyleState): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  // Bucket 1 — surface + foreground stops derived from their curves.
  for (const curve of [state.surfaceCurve, state.foregroundCurve]) {
    for (const point of curve.points) {
      root.style.setProperty(`--color-${point.key}`, computeSurfaceColor(point, curve.endpoints));
    }
  }
  // Bucket 2 — full oklch(...) strings verbatim.
  for (const [name, value] of Object.entries(state.oklch)) {
    root.style.setProperty(name, value);
  }
  // Bucket 3 — bare HSL triplets verbatim.
  for (const [name, value] of Object.entries(state.hsl)) {
    root.style.setProperty(name, value);
  }
  // Bucket 4 — semantic token -> ramp stop bindings (live var() references).
  for (const [token, stop] of Object.entries(state.bindings)) {
    root.style.setProperty(`--color-${token}`, `var(--color-${stop})`);
  }
}

function validateState(parsed: unknown): StyleState {
  const s = parsed as Partial<StyleState>;
  if (!s || s.version !== 1) throw new Error("Expected version 1");
  if (!s.surfaceCurve || !Array.isArray(s.surfaceCurve.points) || s.surfaceCurve.points.length !== 9) {
    throw new Error("surfaceCurve.points must have 9 entries");
  }
  if (!s.surfaceCurve.endpoints) throw new Error("Missing surfaceCurve.endpoints");
  if (!s.foregroundCurve || !Array.isArray(s.foregroundCurve.points) || s.foregroundCurve.points.length !== 7) {
    throw new Error("foregroundCurve.points must have 7 entries");
  }
  if (!s.foregroundCurve.endpoints) throw new Error("Missing foregroundCurve.endpoints");
  if (!s.oklch || typeof s.oklch !== "object") throw new Error("Missing oklch bucket");
  if (!s.hsl || typeof s.hsl !== "object") throw new Error("Missing hsl bucket");
  if (!s.bindings || typeof s.bindings !== "object") throw new Error("Missing bindings");
  return s as StyleState;
}

// Read persisted state on the client; fall back to fresh defaults (and on SSR).
function loadInitial(): StyleState {
  if (typeof window === "undefined") return freshState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return validateState(JSON.parse(raw));
  } catch {
    /* corrupt/old payload — fall through to defaults */
  }
  return freshState();
}

export function StyleProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<StyleState>(loadInitial);

  // Apply persisted state to the document once on mount so it survives reloads.
  useEffect(() => {
    applyState(state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist on every change.
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* quota/unavailable — non-fatal for a dev tool */
    }
  }, [state]);

  const resetAll = useCallback(() => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    if (typeof document !== "undefined") {
      for (const prop of MANAGED_PROPERTIES) document.documentElement.style.removeProperty(prop);
    }
    setState(freshState());
  }, []);

  const setPoint = useCallback((curve: CurveKey, key: string, t: number, l: number) => {
    setState((prev) => ({
      ...prev,
      [curve]: {
        ...prev[curve],
        points: prev[curve].points.map((p) => (p.key === key ? { ...p, t, l } : p)),
      },
    }));
  }, []);

  const setEndpoint = useCallback((curve: CurveKey, which: keyof SurfaceEndpoints, value: number) => {
    setState((prev) => ({
      ...prev,
      [curve]: { ...prev[curve], endpoints: { ...prev[curve].endpoints, [which]: value } },
    }));
  }, []);

  // Evenly redistribute every point's t/l on the straight line from the
  // first point to the last (endpoints stay put).
  const interpolatePoints = useCallback((curve: CurveKey) => {
    setState((prev) => {
      const pts = prev[curve].points;
      if (pts.length < 2) return prev;
      const first = pts[0];
      const last = pts[pts.length - 1];
      const n = pts.length - 1;
      return {
        ...prev,
        [curve]: {
          ...prev[curve],
          points: pts.map((p, i) => ({
            ...p,
            t: first.t + ((last.t - first.t) * i) / n,
            l: first.l + ((last.l - first.l) * i) / n,
          })),
        },
      };
    });
  }, []);

  const setOklch = useCallback((varName: string, value: string) => {
    setState((prev) => ({ ...prev, oklch: { ...prev.oklch, [varName]: value } }));
  }, []);

  const setHsl = useCallback((varName: string, value: string) => {
    setState((prev) => ({ ...prev, hsl: { ...prev.hsl, [varName]: value } }));
  }, []);

  const setBinding = useCallback((token: string, stop: string) => {
    setState((prev) => ({ ...prev, bindings: { ...prev.bindings, [token]: stop } }));
  }, []);

  const replaceState = useCallback((next: StyleState) => setState(next), []);

  const applyToDocument = useCallback(() => applyState(state), [state]);

  const toJSON = useCallback(() => JSON.stringify(state, null, 2), [state]);

  const fromJSON = useCallback((raw: string) => {
    const next = validateState(JSON.parse(raw));
    setState(next);
    applyState(next);
  }, []);

  const value = useMemo<StyleContextValue>(
    () => ({
      state,
      setPoint,
      setEndpoint,
      interpolatePoints,
      setOklch,
      setHsl,
      setBinding,
      replaceState,
      applyToDocument,
      resetAll,
      toJSON,
      fromJSON,
    }),
    [
      state,
      setPoint,
      setEndpoint,
      interpolatePoints,
      setOklch,
      setHsl,
      setBinding,
      replaceState,
      applyToDocument,
      resetAll,
      toJSON,
      fromJSON,
    ]
  );

  return <StyleContext.Provider value={value}>{children}</StyleContext.Provider>;
}
