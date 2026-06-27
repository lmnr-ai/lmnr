"use client";

// TEMPORARY style exploration tooling — safe to delete this folder + the mount in layout.tsx.
// Entry point: wraps the floating HUD in the StyleProvider.

import PanelShell from "./panel-shell";
import { StyleProvider } from "./style-context";

export default function StyleExplorer() {
  return (
    <StyleProvider>
      <PanelShell />
    </StyleProvider>
  );
}
