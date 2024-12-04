import { oneDark } from 'react-syntax-highlighter/dist/cjs/styles/prism';
import React from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';

interface CodeProps {
  language?: string;
  code: string;
  className?: string;
  showLineNumbers?: boolean;
}

export default function CodeHighlighter({
  language,
  code,
  className,
  showLineNumbers = false
}: CodeProps) {
  return (
    <div className={className}>
      <SyntaxHighlighter
        language={language}
        style={{
          ...oneDark,
          '.linenumber': {
            fontStyle: 'normal !important'
          },
          'span': {
            fontStyle: 'normal !important',
          }
        }}
        useInlineStyles={true}
        showLineNumbers={showLineNumbers}
        showInlineLineNumbers={showLineNumbers}
        customStyle={{
          backgroundColor: 'transparent',
          padding: '0',
          margin: '0',
          fontSize: '0.9rem',
          lineHeight: '1.5',
          fontStyle: 'normal',
        }}
        codeTagProps={{
          style: {
            backgroundColor: 'transparent !important',
            fontStyle: 'normal !important'
          }
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}
