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
      // wrapLines
      // wrapLongLines
      // customStyle={{
      //   padding: '0.5rem',
      //   margin: '0',
      //   fontSize: '0.75rem',
      //   lineHeight: '1.5',
      // }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  )
}