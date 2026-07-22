"use client";

// TEMPORARY style exploration tooling — safe to delete this folder + the mount in layout.tsx.
// #11 edge-treatment configurator: pick None / Border / Micka for raised-surface rims, then
// fine-tune the rim alphas. UNWIRE: deleting this section + the `edge` state + EDGE_VARIANTS +
// the :root --edge-* vars removes the switch; keep the winning variant's numbers in globals.css.

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

import { useStyleContext } from "./style-context";
import { type EdgeState, type EdgeVariant } from "./tokens";

const VARIANTS: { value: EdgeVariant; label: string }[] = [
  { value: "none", label: "None" },
  { value: "border", label: "Border" },
  { value: "micka", label: "Micka" },
];

const ALPHAS: { key: keyof Omit<EdgeState, "variant">; label: string }[] = [
  { key: "border", label: "Flat rim (white)" },
  { key: "highlight", label: "Top highlight (white)" },
  { key: "inner", label: "Inner ring (white)" },
  { key: "outer", label: "Outer ring (black)" },
];

export default function EdgeSection() {
  const { state, setEdgeVariant, setEdgeAlpha } = useStyleContext();
  const { edge } = state;

  return (
    <div className="flex flex-col gap-3">
      <div className="text-xs font-medium text-foreground">Edge treatment (raised surfaces)</div>
      <div className="grid grid-cols-3 gap-1">
        {VARIANTS.map((v) => (
          <Button
            key={v.value}
            variant={edge.variant === v.value ? "secondary" : "outline"}
            size="sm"
            onClick={() => setEdgeVariant(v.value)}
            className={cn(edge.variant === v.value && "ring-1 ring-primary/50")}
          >
            {v.label}
          </Button>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        {ALPHAS.map((a) => (
          <div key={a.key} className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{a.label}</span>
              <span className="tabular-nums">{edge[a.key].toFixed(3)}</span>
            </div>
            <Slider
              value={[edge[a.key]]}
              min={0}
              max={0.4}
              step={0.005}
              onValueChange={(v) => setEdgeAlpha(a.key, v[0])}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
