"use client";

// TEMPORARY style exploration tooling — safe to delete this folder + the mount in layout.tsx.
// Surface + Text scale sections, plus the single Save button that applies everything.

import { Button } from "@/components/ui/button";

import ScaleSection from "./scale-section";
import { useStyleContext } from "./style-context";

export default function ColorTab() {
  const { applyToDocument } = useStyleContext();

  return (
    <div className="flex flex-col gap-6">
      <ScaleSection curve="surfaceCurve" title="Surface curve" chipsLabel="Surface stops" />
      <div className="h-px w-full bg-border" />
      <ScaleSection curve="foregroundCurve" title="Text curve" chipsLabel="Text stops" />
      <Button variant="default" size="md" onClick={applyToDocument} className="w-full">
        Save (apply to app)
      </Button>
    </div>
  );
}
