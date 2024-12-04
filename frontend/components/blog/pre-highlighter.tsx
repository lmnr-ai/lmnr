'use client';

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
  const code = children.props.children;
  const language = children.props.className.split(" ").find((c: string) => c.startsWith("language-"))?.split("-")[1];
  return <CodeHighlighter
    code={code}
    language={language}
    className={cn("bg-secondary rounded-md", className)}
    copyable
  />;
}
