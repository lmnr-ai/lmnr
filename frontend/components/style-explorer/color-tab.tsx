"use client";

// TEMPORARY style exploration tooling — safe to delete this folder + the mount in layout.tsx.
// Surface + Text scale sections. Changes live-apply (debounced) — there is no Save button.

import BindingsSection from "./bindings-section";
import ScaleSection from "./scale-section";
import SemanticColorsSection from "./semantic-colors-section";

export default function ColorTab() {
  return (
    <div className="flex flex-col gap-6">
      <ScaleSection curve="surfaceCurve" title="Surface curve" chipsLabel="Surface stops" />
      <div className="h-px w-full bg-border" />
      <ScaleSection curve="foregroundCurve" title="Text curve" chipsLabel="Text stops" />
      <div className="h-px w-full bg-border" />
      <BindingsSection />
      <div className="h-px w-full bg-border" />
      <SemanticColorsSection />
    </div>
  );
}
