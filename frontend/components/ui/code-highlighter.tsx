import { CopyIcon } from 'lucide-react';
import React from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/cjs/styles/prism';

import { Button } from './button';

interface CodeProps {
  language?: string;
  code: string;
  className?: string;
  copyable?: boolean;
}

export default function CodeHighlighter({
  language,
  code,
  className,
  copyable = false
}: CodeProps) {
  return (
    <div className={className}>
      <div className="relative">
        <Button
          onClick={() => navigator.clipboard.writeText(code)}
          className="absolute right-2 top-2"
          variant="ghost"
        >
          <CopyIcon className="w-4 h-4" />
        </Button>
      </div>
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
