import React from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";

import { CopyButton } from "@/components/ui/copy-button";
import { cn } from "@/lib/utils";

interface CodeProps {
  language?: string;
  code: string;
  className?: string;
  copyable?: boolean;
}

export default function CodeHighlighter({ language, code, className, copyable = false }: CodeProps) {
  return (
    <div className={cn("code-highlighter relative group", className)}>
      {copyable && (
        <CopyButton
          size="icon"
          variant="ghost"
          className="invisible group-hover:visible absolute text-secondary-foreground right-1 top-1"
          text={code}
        />
      )}
      <SyntaxHighlighter
        language={language}
        useInlineStyles={false}
        wrapLongLines
        customStyle={{
          backgroundColor: "transparent",
          padding: "0",
          margin: "0",
          fontSize: "0.9rem",
          lineHeight: "1.5",
          fontStyle: "normal",
        }}
        codeTagProps={{ style: {} }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}
