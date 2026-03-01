"use client";

import { diffWords } from "diff";
import { useMemo } from "react";

import { cn } from "@/lib/utils";

interface DiffTextViewProps {
  leftText: string;
  rightText: string;
}

export default function DiffTextView({ leftText, rightText }: DiffTextViewProps) {
  const changes = useMemo(() => diffWords(leftText, rightText), [leftText, rightText]);

  return (
    <div className="overflow-auto h-full styled-scrollbar font-mono text-xs px-2 py-1 leading-5 whitespace-pre-wrap break-all">
      {changes.map((change, i) => (
        <span
          key={i}
          className={cn(
            change.added && "bg-green-500/20 text-green-300",
            change.removed && "bg-red-500/20 text-destructive"
          )}
        >
          {change.value}
        </span>
      ))}
    </div>
  );
}
