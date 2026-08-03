"use client";

import { useDialKit } from "dialkit";

// Decoration variants for attached overlays, tuned live via the shared DialKit "Overlay" control.
const SHADOW_1 =
  "shadow-[inset_0_1px_0_0_var(--color-border),inset_0_0_0_1px_var(--color-surface-up-2),0_0_0_1px_rgba(0,0,0,0.4),0_2px_4px_1px_rgba(0,0,0,0.4)]";
const SHADOW_2 = "border border-surface-up-2 shadow-[0_0_0_1px_rgba(0,0,0,0.4),0_2px_4px_1px_rgba(0,0,0,0.4)]";

/**
 * Live-tweakable elevation + decoration SHARED across every "attached" contextual overlay — popover,
 * dropdown menu (+ submenu), select, tooltip. One DialKit control (stable `id: "overlay"`) drives
 * all of them together; detached surfaces (dialog, sheet) deliberately opt out. Returns the
 * `offset` for `<ElevatedSurface>` and the decoration className to drop into its `cn(...)`.
 *
 * This is sandbox-only dev tooling: bake the tuned values into static classes and remove DialKit
 * (this hook + its call sites) before any of it leaves the sandbox branch — see CLAUDE.md.
 */
export function useOverlayDials(): { offset: number; decorationClass: string } {
  const dials = useDialKit(
    "Overlay",
    {
      decoration: { type: "select", options: ["border", "shadow-1", "shadow-2", "none"], default: "border" },
      elevation: [3, 0, 5],
    },
    { id: "overlay", persist: true }
  );

  const decorationClass =
    dials.decoration === "border"
      ? "border"
      : dials.decoration === "shadow-1"
        ? SHADOW_1
        : dials.decoration === "shadow-2"
          ? SHADOW_2
          : "";

  return { offset: dials.elevation, decorationClass };
}
