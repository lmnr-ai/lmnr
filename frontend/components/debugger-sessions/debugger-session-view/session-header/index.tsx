"use client";

import { fmtRelative } from "./utils";

export interface SessionHeaderProps {
  title: string;
  // Earliest run start / latest run end across loaded traces, in epoch ms.
  // Undefined until at least one trace has loaded.
  createdMs?: number;
  lastActivityMs?: number;
  runCount: number;
}

/**
 * Session header at the top of the scrolling article column (Figma 4296:35652):
 * left-aligned, a 24px medium title over a single muted meta line. The
 * jump-to-latest affordance lives in the right-rail outline, not here.
 */
export default function SessionHeader({ title, createdMs, lastActivityMs, runCount }: SessionHeaderProps) {
  return (
    <header className="flex flex-col gap-1 px-4 py-3 border-b shrink-0">
      <h1 className="text-lg font-medium text-foreground">{title}</h1>
      <div className="flex items-center gap-1.5 text-xs text-secondary-foreground">
        <span>Created {fmtRelative(createdMs)}</span>
        <span>·</span>
        <span>Updated {fmtRelative(lastActivityMs)}</span>
        <span>·</span>
        <span>
          {runCount} {runCount === 1 ? "trace" : "traces"}
        </span>
      </div>
    </header>
  );
}
