"use client";

import { CopyButton } from "@/components/ui/copy-button";

import { fmtRelative } from "./utils";

export interface SessionHeaderProps {
  title: string;
  // Earliest run start / latest run end across loaded traces, in epoch ms.
  // Undefined until at least one trace has loaded.
  createdMs?: number;
  lastActivityMs?: number;
  runCount: number;
  sessionId: string;
}

/**
 * Session header at the top of the scrolling article column (Figma 4296:35652):
 * left-aligned, a 24px medium title over a single muted meta line. The
 * jump-to-latest affordance lives in the right-rail outline, not here.
 */
export default function SessionHeader({ title, createdMs, lastActivityMs, runCount, sessionId }: SessionHeaderProps) {
  return (
    <header className="flex flex-col gap-2 py-5 h-[180px] pt-14">
      <h1 className="text-2xl font-medium text-foreground">{title}</h1>
      <div className="flex items-center gap-1.5 text-xs text-secondary-foreground">
        <span>Created {fmtRelative(createdMs)}</span>
        <span>·</span>
        <span>Updated {fmtRelative(lastActivityMs)}</span>
        <span>·</span>
        <span>
          {runCount} {runCount === 1 ? "trace" : "traces"}
        </span>
        <span>·</span>
        <span>
          <CopyButton text={sessionId} variant="ghost" />
        </span>
      </div>
    </header>
  );
}
