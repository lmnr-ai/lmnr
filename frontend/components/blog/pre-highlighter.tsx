"use client";

import React from "react";

import CodeHighlighter from "@/components/ui/code-highlighter";
import { cn } from "@/lib/utils";

interface PreHighlighterProps {
  code: string;
  language?: string;
  className?: string;
}

/**
 * Takes the fence as plain strings rather than reading its `<code>` child: a client component's
 * children can arrive as a lazy reference when React splits a long page into chunks, and a lazy
 * child isn't a valid element, so the block used to render nothing.
 */
export default function PreHighlighter({ code, language, className }: PreHighlighterProps) {
  return (
    <CodeHighlighter
      code={code}
      language={language}
      className={cn("bg-secondary rounded-md mt-4", className)}
      copyable
    />
  );
}
