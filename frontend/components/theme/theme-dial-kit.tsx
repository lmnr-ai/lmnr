"use client";

import { DialRoot, useDialKit } from "dialkit";
import { useLayoutEffect } from "react";

const LIGHT_SURFACE_BASE_PROPERTY = "--light-surface-base";
const DEFAULT_LIGHT_SURFACE_BASE = "oklch(0.94 0 0)";

// How much darker each light-mode border is than the surface it sits on (OKLCH lightness).
const LIGHT_BORDER_DELTA_PROPERTY = "--light-border-delta";
const DEFAULT_LIGHT_BORDER_DELTA = 0.04;

// Shifts every dark-mode surface step lighter (+) or darker (-) in OKLCH lightness. Set on <html>:
// the dark ramp is @theme (:root), so a body-level value would never reach it.
const DARK_SURFACE_DELTA_PROPERTY = "--dark-surface-delta";
const DEFAULT_DARK_SURFACE_DELTA = 0;

const SIDEBAR_SURFACE_PROPERTY = "--sidebar-surface";
const SURFACE_STEPS = [
  "00",
  "50",
  "100",
  "150",
  "200",
  "250",
  "300",
  "350",
  "400",
  "450",
  "500",
  "550",
  "600",
  "650",
  "700",
  "750",
  "800",
  "850",
  "900",
  "950",
  "1000",
];
const DEFAULT_SIDEBAR_SURFACE = "100";

export function ThemeDialKit() {
  const { lightSurfaceBase, lightBorderDelta, darkSurfaceDelta, sidebarSurface } = useDialKit("Theme", {
    lightSurfaceBase: {
      type: "color",
      default: DEFAULT_LIGHT_SURFACE_BASE,
    },
    lightBorderDelta: [DEFAULT_LIGHT_BORDER_DELTA, 0, 0.2, 0.005],
    darkSurfaceDelta: [DEFAULT_DARK_SURFACE_DELTA, -0.1, 0.1, 0.005],
    sidebarSurface: {
      type: "select",
      options: SURFACE_STEPS.map((step) => ({ value: step, label: `surface-${step}` })),
      default: DEFAULT_SIDEBAR_SURFACE,
    },
  });

  useLayoutEffect(() => {
    document.body.style.setProperty(LIGHT_SURFACE_BASE_PROPERTY, lightSurfaceBase);
    document.body.style.setProperty(LIGHT_BORDER_DELTA_PROPERTY, String(lightBorderDelta));
    document.documentElement.style.setProperty(DARK_SURFACE_DELTA_PROPERTY, String(darkSurfaceDelta));
    document.body.style.setProperty(SIDEBAR_SURFACE_PROPERTY, `var(--color-surface-${sidebarSurface})`);

    return () => {
      document.body.style.removeProperty(LIGHT_SURFACE_BASE_PROPERTY);
      document.body.style.removeProperty(LIGHT_BORDER_DELTA_PROPERTY);
      document.documentElement.style.removeProperty(DARK_SURFACE_DELTA_PROPERTY);
      document.body.style.removeProperty(SIDEBAR_SURFACE_PROPERTY);
    };
  }, [lightSurfaceBase, lightBorderDelta, darkSurfaceDelta, sidebarSurface]);

  return <DialRoot />;
}
