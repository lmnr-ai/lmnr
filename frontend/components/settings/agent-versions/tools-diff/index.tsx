"use client";

import { useMemo } from "react";

import ToolChangeRow from "./tool-change-row";
import { diffTools } from "./utils";

/** Rows open by default when at most this many tools changed. */
const AUTO_EXPAND_LIMIT = 3;

interface ToolsDiffProps {
  oldText: string;
  newText: string;
}

export default function ToolsDiff({ oldText, newText }: ToolsDiffProps) {
  const { changes, unchanged } = useMemo(() => diffTools(oldText, newText), [oldText, newText]);
  const defaultOpen = changes.length <= AUTO_EXPAND_LIMIT;

  return (
    <div className="flex flex-col divide-y rounded-md border">
      {changes.map((change) => (
        <ToolChangeRow key={change.name} change={change} defaultOpen={defaultOpen} />
      ))}
      {unchanged > 0 && (
        <div className="px-3 py-1.5 text-xs text-muted-foreground">
          {unchanged} unchanged tool{unchanged === 1 ? "" : "s"}
        </div>
      )}
    </div>
  );
}
