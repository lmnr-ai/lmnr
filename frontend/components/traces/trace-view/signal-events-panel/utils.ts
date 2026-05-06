import { createContext, useContext } from "react";

import { type TraceSignal } from "@/components/traces/trace-view/store/base";
import { getClusterColorById } from "@/lib/clusters/colors";

/** Tailwind blue-400. Fallback hue for signals that haven't been clustered yet
 *  so the panel still feels colored rather than plain. */
const UNCLUSTERED_BASE_COLOR = "#60a5fa";

/** A signal's display color: leaf cluster's color if clustered, blue-400 otherwise. */
export function getSignalDisplayColor(signal: TraceSignal): string {
  const leaf = signal.clusterPath[signal.clusterPath.length - 1];
  return leaf ? getClusterColorById(leaf.id) : UNCLUSTERED_BASE_COLOR;
}

/** Resolved accent palette for the panel — derived once from the active
 *  signal's display color, then shared across the trigger/portal/body via
 *  context so trigger and portal stay in sync without recomputing. */
export type PanelAccent = {
  /** Outer container border. */
  borderColor: string;
  /** Active tab background. */
  tabActiveBg: string;
  /** Toolbar buttons + category badge border. */
  accentBorder: string;
  /** Subtle panel background tint, undefined when no leaf cluster. */
  panelTint: string | undefined;
};

export function deriveAccent(activeSignal: TraceSignal | undefined): PanelAccent {
  const base = activeSignal ? getSignalDisplayColor(activeSignal) : null;
  return {
    borderColor: base ? `${base}60` : "hsl(var(--border))",
    tabActiveBg: base ? `${base}40` : "transparent",
    accentBorder: base ? `${base}66` : "hsl(var(--border))",
    panelTint: base ? `${base}1a` : undefined,
  };
}

const FALLBACK_ACCENT: PanelAccent = {
  borderColor: "hsl(var(--border))",
  tabActiveBg: "transparent",
  accentBorder: "hsl(var(--border))",
  panelTint: undefined,
};

const PanelAccentContext = createContext<PanelAccent>(FALLBACK_ACCENT);

export const PanelAccentProvider = PanelAccentContext.Provider;
export const usePanelAccent = () => useContext(PanelAccentContext);

export function schemaFieldsToStructuredOutput(fields: TraceSignal["schemaFields"]): {
  type: string;
  properties: Record<string, { type: string; description: string }>;
} {
  return fields.reduce(
    (acc, f) => {
      if (f.name.trim()) {
        acc.properties[f.name] = { type: f.type, description: f.description ?? "" };
      }
      return acc;
    },
    { type: "object", properties: {} } as {
      type: string;
      properties: Record<string, { type: string; description: string }>;
    }
  );
}
