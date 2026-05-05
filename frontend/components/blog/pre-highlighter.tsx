"use client";

import React from "react";

import CodeHighlighter from "@/components/ui/code-highlighter";
import { cn } from "@/lib/utils";

interface PreHighlighterProps {
  children?: React.ReactElement | React.ReactNode;
  className?: string;
}

export default function PreHighlighter({ children, className }: PreHighlighterProps) {
  if (!children || !React.isValidElement(children)) {
    return null;
  }
  const code = (children.props as any).children;
  const classNameProp = (children.props as any).className;
  const language =
    typeof classNameProp === "string"
      ? classNameProp
          .split(" ")
          .find((c: string) => c.startsWith("language-"))
          ?.split("-")[1]
      : undefined;
  return (
    <CodeHighlighter
      code={code}
      language={language}
      className={cn("bg-landing-surface-600 border border-landing-surface-500 rounded-md mt-4 p-4", className)}
      copyable
    />
  );
}
