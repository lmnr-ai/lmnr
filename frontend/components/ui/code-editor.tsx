import { html } from '@codemirror/lang-html';
import { json } from '@codemirror/lang-json';
import { python } from '@codemirror/lang-python';
import { yaml } from '@codemirror/lang-yaml';
import { EditorView } from '@codemirror/view';
import { githubDarkStyle } from '@uiw/codemirror-theme-github';
import { createTheme } from '@uiw/codemirror-themes';
import CodeMirror from '@uiw/react-codemirror';

import { cn } from '@/lib/utils';

interface CodeEditorProps {
  value: string;
  className?: string;
  language?: string;
  editable?: boolean;
  onChange?: (value: string) => void;
  placeholder?: string;
  background?: string;
  lineWrapping?: boolean;
}

const myTheme = createTheme({
  theme: 'dark',
  settings: {
    fontSize: '11pt',
    background: 'transparent',
    lineHighlight: 'transparent',
    gutterBackground: 'transparent',
    gutterBorder: 'transparent',
    gutterForeground: 'gray !important',
    selection: '#193860',
    selectionMatch: 'transparent',
    caret: '2px solid hsl(var(--primary) / 0.1)',
  },
  styles: githubDarkStyle,
});

export default function CodeEditor({
  value,
  language = 'text',
  editable = true,
  onChange,
  className,
  placeholder,
  background,
  lineWrapping = true
}: CodeEditorProps) {
  const extensions = [
    EditorView.theme({
      '&.cm-focused': {
        outline: 'none !important'
      },
      '&': {
        fontSize: '10pt !important',
      }
    })
  ];

  if (lineWrapping) {
    extensions.push(EditorView.lineWrapping);
  }

  if (language === 'python') {
    extensions.push(python());
  } else if (language === 'json') {
    extensions.push(json());
  } else if (language === 'yaml') {
    extensions.push(yaml());
  } else if (language === 'html') {
    extensions.push(html());
  }

  return (
    <div className={cn('w-full h-full flex flex-col p-2 bg-card text-foreground', background, className)}>
      <CodeMirror
        placeholder={placeholder}
        className={cn('border-none bg-card', background)}
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
