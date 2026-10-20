"use client";

import { DialRoot, useDialKit } from "dialkit";
import { useLayoutEffect } from "react";

const LIGHT_SURFACE_BASE_PROPERTY = "--light-surface-base";
const DEFAULT_LIGHT_SURFACE_BASE = "oklch(0.94 0 0)";

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
];
const DEFAULT_SIDEBAR_SURFACE = "100";

export function ThemeDialKit() {
  const { lightSurfaceBase, sidebarSurface } = useDialKit("Theme", {
    lightSurfaceBase: {
      type: "color",
      default: DEFAULT_LIGHT_SURFACE_BASE,
    },
    sidebarSurface: {
      type: "select",
      options: SURFACE_STEPS.map((step) => ({ value: step, label: `surface-${step}` })),
      default: DEFAULT_SIDEBAR_SURFACE,
    },
  });

  useLayoutEffect(() => {
    document.body.style.setProperty(LIGHT_SURFACE_BASE_PROPERTY, lightSurfaceBase);
    document.body.style.setProperty(SIDEBAR_SURFACE_PROPERTY, `var(--color-surface-${sidebarSurface})`);

    return () => {
      document.body.style.removeProperty(LIGHT_SURFACE_BASE_PROPERTY);
      document.body.style.removeProperty(SIDEBAR_SURFACE_PROPERTY);
    };
  }, [lightSurfaceBase, sidebarSurface]);

  return <DialRoot />;
}
