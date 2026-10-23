"use client";

import { useMemo } from "react";

import ToolChangeRow from "./tool-change-row";
import { diffTools } from "./utils";

interface ToolsDiffProps {
  oldText: string;
  newText: string;
  oldLabel: string;
  newLabel: string;
}

export default function ToolsDiff({ oldText, newText, oldLabel, newLabel }: ToolsDiffProps) {
  const { changes, unchanged } = useMemo(() => diffTools(oldText, newText), [oldText, newText]);

  return (
    <div className="flex flex-col divide-y overflow-hidden rounded-md border bg-emphasis-0.5">
      {changes.map((change, i) => (
        <ToolChangeRow
          key={change.name}
          change={change}
          oldLabel={oldLabel}
          newLabel={newLabel}
          defaultOpen={i === 0}
        />
      ))}
      {unchanged > 0 && (
        <div className="px-3 py-1.5 text-xs text-muted-foreground">
          {unchanged} unchanged tool{unchanged === 1 ? "" : "s"}
        </div>
      )}
    </div>
  );
}
