import { formatDuration } from "@/lib/utils";

import { SEAM } from "./flat-rows";

/**
 * The two ways a seam (the space between two top-level timeline blocks) renders.
 * Blocks carry no vertical padding — a seam row owns all inter-block spacing, so
 * the rhythm is uniform and driven by the single `SEAM` unit in flat-rows.
 *
 * - `SeamSpacer`: bare `SEAM`px gap, used wherever a text block is on either side.
 * - `SeamDivider`: a hairline with the centered elapsed-time gap between the two
 *   surrounding timeline blocks (trace / eval / command). `SEAM` padding each
 *   side keeps it on the same spacing scale; the label is omitted when the gap is
 *   unknown (e.g. a not-yet-loaded trace) or non-positive.
 */
export function SeamSpacer() {
  return <div aria-hidden className="" style={{ height: SEAM }} />;
}

export function SeamDivider({ gapMs }: { gapMs?: number }) {
  const label = gapMs && gapMs > 0 ? formatDuration(gapMs) : "";
  return (
    <div className="flex items-center gap-2 px-2" style={{ paddingTop: SEAM, paddingBottom: SEAM }}>
      <div className="h-px flex-1 bg-border" />
      {label && <span className="shrink-0 text-xs text-muted-foreground">{label}</span>}
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}
