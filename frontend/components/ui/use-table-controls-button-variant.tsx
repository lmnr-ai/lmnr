"use client";

import { useDialKit } from "dialkit";

import { type ButtonProps } from "@/components/ui/button";

// Every button variant, so the dial can preview any of them live.
const VARIANTS = [
  "secondary",
  "secondaryLight",
  "outline",
  "outlinePrimary",
  "default",
  "ghost",
  "light",
  "lightSecondary",
  "destructive",
  "destructiveOutline",
  "warning",
  "warningOutline",
  "link",
] as const;

/**
 * Live-tweakable button variant SHARED across every table-control trigger — filter, columns,
 * views picker, date-range, refresh. One DialKit select (stable `id: "TableControlsButtonVariant"`)
 * drives them all together; default "secondary" matches the baked-in choice.
 *
 * Sandbox-only dev tooling: bake the chosen variant into each static `variant` prop and remove this
 * hook + its call sites before it leaves the sandbox branch — see CLAUDE.md.
 */
export function useTableControlsButtonVariant(): ButtonProps["variant"] {
  const dials = useDialKit(
    "Table Controls",
    { TableControlsButtonVariant: { type: "select", options: [...VARIANTS], default: "secondary" } },
    { id: "TableControlsButtonVariant", persist: true }
  );
  return dials.TableControlsButtonVariant as ButtonProps["variant"];
}
