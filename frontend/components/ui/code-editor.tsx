import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from './select';
import { useState } from 'react';
import YAML from 'yaml';
import CodeMirror from '@uiw/react-codemirror';
import { createTheme } from '@uiw/codemirror-themes';
import { githubDarkStyle, githubDark } from '@uiw/codemirror-theme-github';
import { json } from '@codemirror/lang-json';
import { yaml } from '@codemirror/lang-yaml';
import { python } from '@codemirror/lang-python';
import { EditorView } from '@codemirror/view';
import { cn } from '@/lib/utils';

interface CodeEditorProps {
  value: string;
  className?: string;
  language?: string;
  editable?: boolean;
  onChange?: (value: string) => void;
  placeholder?: string;
}

const myTheme = createTheme({
  theme: 'dark',
  settings: {
    fontSize: '11pt',
    background: 'transparent',
    lineHighlight: 'transparent',
    gutterBackground: 'transparent',
    gutterBorder: 'transparent',
    gutterForeground: 'gray !important'
  },
  styles: githubDarkStyle
});

export default function CodeEditor({
  value,
  language = 'text',
  editable = true,
  onChange,
  className,
  placeholder
}: CodeEditorProps) {
  const extensions = [
    EditorView.lineWrapping,
    EditorView.theme({
      '&.cm-focused': {
        outline: 'none !important'
      }
    })
  ];

  if (language === 'python') {
    extensions.push(python());
  } else if (language === 'json') {
    extensions.push(json());
  } else if (language === 'yaml') {
    extensions.push(yaml());
  }

  return (
    <div className={cn('w-full h-full flex flex-col p-2', className)}>
      <CodeMirror
        placeholder={placeholder}
        className="border-none"
        theme={myTheme}
        extensions={extensions}
        editable={editable}
        value={value}
        onChange={(v) => {
          onChange?.(v);
        }}
      />
    </div>
  );
}
