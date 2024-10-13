import React from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/cjs/styles/prism';
interface CodeProps {
  language?: string;
  code: string;
  className?: string;
}

export default function Code({ language, code, className }: CodeProps) {
  return (
    <div className={className}>
      <SyntaxHighlighter
        language={language}
        style={oneDark}
        showLineNumbers={false}
        showInlineLineNumbers={false}
        customStyle={{
          backgroundColor: 'transparent',
          padding: '0',
          margin: '0',
          fontSize: '0.9rem',
          lineHeight: '1.5',
        }}
        codeTagProps={{
          style: {
            backgroundColor: 'transparent !important',
          },
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}
