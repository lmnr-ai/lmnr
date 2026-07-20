"use client";

import type { GalleryEntry } from "./registry";
import { cartesian } from "./utils";

const CELL_CAP = 48;

interface GridProps {
  entry: GalleryEntry;
}

export default function Grid({ entry }: GridProps) {
  const { Component, defaultProps, sampleChildren } = entry;
  const { combos, capped, total } = cartesian(entry.variants, CELL_CAP);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">All combinations</span>
        <span>
          {combos.length} of {total}
        </span>
        {capped && <span>(capped at {CELL_CAP})</span>}
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
        {combos.map((combo, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-md border border-border bg-background p-3">
            <div className="flex min-h-12 items-center justify-center">
              <Component {...defaultProps} {...combo}>
                {sampleChildren}
              </Component>
            </div>
            <div className="flex flex-col gap-0.5 text-[10px] text-muted-foreground">
              {Object.entries(combo).map(([key, value]) => (
                <span key={key}>
                  {key}: <span className="text-foreground">{value}</span>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
