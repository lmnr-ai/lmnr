"use client";

// #7: gallery of the saturated/"bright" accent tokens — swatch + token name + resolved value —
// for at-a-glance comparison and picking. Resolved values are read off the live DOM and refresh
// when the style-explorer mutates the root custom properties (MutationObserver, no context coupling).
// TEMPORARY tooling; delete with the rest of ui-gallery / style-explorer.

import { useEffect, useState } from "react";

// Consumed as hsl(var(--x)); the bright/saturated accents worth eyeballing together.
const BRIGHT_TOKENS = [
  "success-bright",
  "destructive-bright",
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
  "llm",
  "subagent",
];

function readResolved(): Record<string, string> {
  if (typeof document === "undefined") return {};
  const probe = document.createElement("div");
  probe.style.display = "none";
  document.body.appendChild(probe);
  const out: Record<string, string> = {};
  for (const t of BRIGHT_TOKENS) {
    probe.style.backgroundColor = `hsl(var(--${t}))`;
    out[t] = getComputedStyle(probe).backgroundColor;
  }
  probe.remove();
  return out;
}

export default function ColorSwatches() {
  const [resolved, setResolved] = useState<Record<string, string>>({});

  useEffect(() => {
    const refresh = () => setResolved(readResolved());
    refresh();
    // Re-read when the style-explorer rewrites the root custom properties.
    const obs = new MutationObserver(refresh);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["style"] });
    return () => obs.disconnect();
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Colors</h2>
      <p className="text-sm text-muted-foreground">
        The saturated accent tokens, side by side. Each card shows the token and the value it currently resolves to.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {BRIGHT_TOKENS.map((t) => (
          <div key={t} className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
            <div className="h-16 w-full rounded-md border border-border" style={{ backgroundColor: `hsl(var(--${t}))` }} />
            <div className="flex flex-col gap-0.5">
              <span className="truncate font-mono text-xs text-foreground">{t}</span>
              <span className="truncate font-mono text-[11px] tabular-nums text-muted-foreground">
                {resolved[t] ?? "…"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
