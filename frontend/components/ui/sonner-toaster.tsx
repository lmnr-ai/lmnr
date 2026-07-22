"use client";

import type { CSSProperties } from "react";
import { Toaster as SonnerToaster } from "sonner";

// A toast floats above everything, so it reads as a dialog-level surface: surface-300 fill +
// shadow-elevation-600 (the SURFACE_OFFSET.dialog / SHADOW_LEVEL.dialog recipe) + the edge rim,
// and it publishes --surface-raise so any action buttons hover correctly. Sonner portals to the
// document root (outside the surface context), so the dialog level is applied literally here.
const toastStyle: CSSProperties = {
  background: "var(--color-surface-300)",
  color: "var(--color-foreground)",
  border: "1px solid var(--edge-border-color)",
  boxShadow: "var(--shadow-elevation-600)",
  ["--surface-raise" as string]: "var(--color-surface-500)",
};

export function Toaster() {
  return <SonnerToaster theme="dark" position="top-right" toastOptions={{ style: toastStyle }} />;
}
