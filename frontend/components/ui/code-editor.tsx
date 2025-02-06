import { html } from '@codemirror/lang-html';
import { json } from '@codemirror/lang-json';
import { python } from '@codemirror/lang-python';
import { yaml } from '@codemirror/lang-yaml';
import { EditorView } from '@codemirror/view';
import { githubDarkStyle } from '@uiw/codemirror-theme-github';
import { createTheme } from '@uiw/codemirror-themes';
import CodeMirror from '@uiw/react-codemirror';
import { useMemo, useCallback, useEffect, useRef, useState } from 'react';
import { debounce } from 'lodash';
import { useInView } from 'react-intersection-observer';

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
    gutterBackground: '#1D1D20',
    gutterBorder: 'transparent',
    gutterForeground: 'gray !important',
    selection: '#193860',
    selectionMatch: 'transparent',
    caret: '2px solid hsl(var(--primary) / 0.1)',
  },
  styles: githubDarkStyle,
});

const MAX_LINE_WRAPPING_LENGTH = 500000;

// Move these outside the component since they don't need to be recreated
const baseExtensions = [
  EditorView.theme({
    '&.cm-focused': {
      outline: 'none !important'
    },
    '&': {
      fontSize: '10pt !important',
    },
    '&.cm-editor': {
      flex: 1,
      height: '100%',
      width: '100%',
      position: 'relative',
    },
    '&.cm-scroller': {
      position: 'absolute !important',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      overflow: 'auto',
    }
  })
];

const languageExtensions = {
  python: () => python(),
  json: () => json(),
  yaml: () => yaml(),
  html: () => html(),
};

export default function CodeEditor({
  value,
  language = 'text',
  editable = false,
  onChange,
  className,
  placeholder,
  background,
  lineWrapping = true
}: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const { ref: inViewRef, inView } = useInView({
    threshold: 0,
    triggerOnce: false
  });

  // Combine refs
  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      containerRef.current = node;
      inViewRef(node);
    },
    [inViewRef]
  );

  // Debounced resize handler
  const handleResize = useCallback(
    debounce(() => {
      if (containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        setDimensions({ width, height });
      }
    }, 100),
    []
  );

  useEffect(() => {
    handleResize();

    const resizeObserver = new ResizeObserver(handleResize);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      handleResize.cancel();
      resizeObserver.disconnect();
    };
  }, [handleResize]);

  // Memoize extensions to prevent recreating them on every render
  const extensions = useMemo(() => {
    const extensions = [...baseExtensions];

    if (lineWrapping && value.length < MAX_LINE_WRAPPING_LENGTH) {
      extensions.push(EditorView.lineWrapping);
    }

    const languageExtension = languageExtensions[language as keyof typeof languageExtensions];
    if (languageExtension) {
      extensions.push(languageExtension());
    }

    return extensions;
  }, [language, lineWrapping, value.length]);

  // Memoize onChange callback
  const handleChange = useCallback((v: string) => {
    onChange?.(v);
  }, [onChange]);

  // Memoize className
  const containerClassName = useMemo(() =>
    cn('w-full h-full bg-card text-foreground', background, className),
    [background, className]
  );

  const editorClassName = useMemo(() =>
    cn('flex h-full', background),
    [background]
  );

  // Render a placeholder when not in view
  if (!inView) {
    return (
      <div
        ref={setRefs}
        className={containerClassName}
        style={{
          height: '100%',
          padding: '1rem',
          whiteSpace: 'pre-wrap',
          overflow: 'hidden',
          fontSize: '10pt'
        }}
      >
        {value.slice(0, 500)}
        {value.length > 500 && '...'}
      </div>
    );
  }

  return (
    <div ref={setRefs} className={containerClassName}>
      <CodeMirror
        placeholder={placeholder}
        className={editorClassName}
        theme={myTheme}
        extensions={extensions}
        editable={editable}
        value={value}
        onChange={handleChange}
        width={`${dimensions.width}px`}
        height={`${dimensions.height}px`}
      />
    </div>
  );
}
