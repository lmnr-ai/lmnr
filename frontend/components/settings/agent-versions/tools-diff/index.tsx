"use client";

import { useMemo } from "react";

import ToolChangeRow from "./tool-change-row";
import { diffTools } from "./utils";

interface ToolsDiffProps {
  oldText: string;
  newText: string;
}

export default function ToolsDiff({ oldText, newText }: ToolsDiffProps) {
  const { changes, unchanged } = useMemo(() => diffTools(oldText, newText), [oldText, newText]);
  const defaultOpen = changes.length === 1;

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
