"use client";

// TEMPORARY style exploration tooling — safe to delete this folder + the mount in layout.tsx.
// Holds the full editable theme state and live-applies it to document.documentElement via
// inline custom-property overrides. Does NOT persist anywhere.

import { createContext, type PropsWithChildren, useCallback, useContext, useMemo, useState } from "react";

import {
  computeSurfaceColor,
  DEFAULT_ENDPOINTS,
  HSL_SEED,
  initialPoints,
  OKLCH_SEED,
  type SurfaceEndpoints,
  type SurfacePoint,
} from "./tokens";

export interface StyleState {
  version: 1;
  surfaceCurve: {
    endpoints: SurfaceEndpoints;
    points: SurfacePoint[];
  };
  oklch: Record<string, string>;
  hsl: Record<string, string>;
}

function freshState(): StyleState {
  return {
    version: 1,
    surfaceCurve: { endpoints: { ...DEFAULT_ENDPOINTS }, points: initialPoints() },
    oklch: { ...OKLCH_SEED },
    hsl: { ...HSL_SEED },
  };
}

interface StyleContextValue {
  state: StyleState;
  setPoint: (key: string, t: number, l: number) => void;
  setEndpoint: (which: keyof SurfaceEndpoints, value: number) => void;
  setOklch: (varName: string, value: string) => void;
  setHsl: (varName: string, value: string) => void;
  replaceState: (next: StyleState) => void;
  applyToDocument: () => void;
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
  // Bucket 1 — surface stops derived from the curve.
  for (const point of state.surfaceCurve.points) {
    root.style.setProperty(`--color-${point.key}`, computeSurfaceColor(point, state.surfaceCurve.endpoints));
  }
  // Bucket 2 — full oklch(...) strings verbatim.
  for (const [name, value] of Object.entries(state.oklch)) {
    root.style.setProperty(name, value);
  }
  // Bucket 3 — bare HSL triplets verbatim.
  for (const [name, value] of Object.entries(state.hsl)) {
    root.style.setProperty(name, value);
  }
}

function validateState(parsed: unknown): StyleState {
  const s = parsed as Partial<StyleState>;
  if (!s || s.version !== 1) throw new Error("Expected version 1");
  if (!s.surfaceCurve || !Array.isArray(s.surfaceCurve.points) || s.surfaceCurve.points.length !== 9) {
    throw new Error("surfaceCurve.points must have 9 entries");
  }
  if (!s.surfaceCurve.endpoints) throw new Error("Missing surfaceCurve.endpoints");
  if (!s.oklch || typeof s.oklch !== "object") throw new Error("Missing oklch bucket");
  if (!s.hsl || typeof s.hsl !== "object") throw new Error("Missing hsl bucket");
  return s as StyleState;
}

export function StyleProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<StyleState>(freshState);

  const setPoint = useCallback((key: string, t: number, l: number) => {
    setState((prev) => ({
      ...prev,
      surfaceCurve: {
        ...prev.surfaceCurve,
        points: prev.surfaceCurve.points.map((p) => (p.key === key ? { ...p, t, l } : p)),
      },
    }));
  }, []);

  const setEndpoint = useCallback((which: keyof SurfaceEndpoints, value: number) => {
    setState((prev) => ({
      ...prev,
      surfaceCurve: { ...prev.surfaceCurve, endpoints: { ...prev.surfaceCurve.endpoints, [which]: value } },
    }));
  }, []);

  const setOklch = useCallback((varName: string, value: string) => {
    setState((prev) => ({ ...prev, oklch: { ...prev.oklch, [varName]: value } }));
  }, []);

  const setHsl = useCallback((varName: string, value: string) => {
    setState((prev) => ({ ...prev, hsl: { ...prev.hsl, [varName]: value } }));
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
      setOklch,
      setHsl,
      replaceState,
      applyToDocument,
      toJSON,
      fromJSON,
    }),
    [state, setPoint, setEndpoint, setOklch, setHsl, replaceState, applyToDocument, toJSON, fromJSON]
  );

  return <StyleContext.Provider value={value}>{children}</StyleContext.Provider>;
}
