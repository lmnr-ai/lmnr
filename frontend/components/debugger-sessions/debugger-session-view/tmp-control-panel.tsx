// TODO: remove — testing only. Floating panel to switch trace-render variants.
"use client";

import { Settings, X } from "lucide-react";

import { cn } from "@/lib/utils";

import { type RenderVariant, useTmpVariantStore } from "./tmp-variant-store";

const VARIANTS: { value: RenderVariant; label: string }[] = [
  { value: 1, label: "Timeline" },
  { value: 2, label: "Input / Output" },
  { value: 3, label: "Hybrid" },
];

export default function TmpControlPanel() {
  const variant = useTmpVariantStore((s) => s.variant);
  const setVariant = useTmpVariantStore((s) => s.setVariant);
  const panelMinimized = useTmpVariantStore((s) => s.panelMinimized);
  const setPanelMinimized = useTmpVariantStore((s) => s.setPanelMinimized);
  const forceEmptyState = useTmpVariantStore((s) => s.forceEmptyState);
  const setForceEmptyState = useTmpVariantStore((s) => s.setForceEmptyState);
  const renderNotesAsMarkdown = useTmpVariantStore((s) => s.renderNotesAsMarkdown);
  const setRenderNotesAsMarkdown = useTmpVariantStore((s) => s.setRenderNotesAsMarkdown);

  if (panelMinimized) {
    return (
      <button
        onClick={() => setPanelMinimized(false)}
        title="TODO: remove, testing"
        className="fixed top-4 right-4 z-[100] flex size-10 items-center justify-center rounded-full border bg-background shadow-lg hover:bg-secondary"
      >
        <Settings className="size-4 text-muted-foreground" />
      </button>
    );
  }

  return (
    <div className="fixed top-4 right-4 z-[100] rounded-lg border bg-background p-2 shadow-lg">
      <div className="mb-1.5 flex items-center justify-between gap-6">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          TODO: remove, testing
        </span>
        <button
          onClick={() => setPanelMinimized(true)}
          title="Minimize"
          className="flex size-5 items-center justify-center rounded hover:bg-secondary"
        >
          <X className="size-3.5 text-muted-foreground" />
        </button>
      </div>
      <div className="flex items-center gap-1">
        {VARIANTS.map((v) => (
          <button
            key={v.value}
            onClick={() => setVariant(v.value)}
            className={cn(
              "rounded border px-2 py-1 text-xs transition-colors",
              variant === v.value
                ? "border-primary bg-primary/15 text-primary"
                : "border-border text-secondary-foreground hover:bg-secondary"
            )}
          >
            {v.label}
          </button>
        ))}
      </div>
      {/* TODO: remove — toggle markdown vs raw rendering of run notes. */}
      <label className="mt-2 flex items-center gap-2 text-xs text-secondary-foreground">
        <input
          type="checkbox"
          checked={renderNotesAsMarkdown}
          onChange={(e) => setRenderNotesAsMarkdown(e.target.checked)}
          className="size-3.5 accent-primary"
        />
        Render notes as markdown
      </label>
      {/* TODO: remove — preview the sessions-list empty/onboarding state. */}
      <label className="mt-2 flex items-center gap-2 text-xs text-secondary-foreground">
        <input
          type="checkbox"
          checked={forceEmptyState}
          onChange={(e) => setForceEmptyState(e.target.checked)}
          className="size-3.5 accent-primary"
        />
        Force empty state
      </label>
    </div>
  );
}
