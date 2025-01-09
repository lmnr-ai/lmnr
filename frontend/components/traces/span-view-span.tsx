import { useEffect, useRef, useState } from 'react';

import { isChatMessageList } from '@/lib/flow/utils';
import { Span } from '@/lib/traces/types';

import Formatter from '../ui/formatter';
import { ScrollArea } from '../ui/scroll-area';
import ChatMessageListTab from './chat-message-list-tab';
import SpanDatasets from './span-datasets';
import SpanLabels from './span-labels';

interface SpanViewSpanProps {
  span: Span;
}

export function SpanViewSpan({ span }: SpanViewSpanProps) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [contentWidth, setContentWidth] = useState<number>(0);

  useEffect(() => {
    if (!scrollAreaRef.current) return;

    const resizeObserver = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) {
        setContentWidth(entry.contentRect.width);
      }
    });

    resizeObserver.observe(scrollAreaRef.current);
    return () => resizeObserver.disconnect();
  }, [scrollAreaRef.current]);

  return (
    <ScrollArea ref={scrollAreaRef} className="w-full h-full mt-0" type="scroll">
      <div className="max-h-0">
        <div
          className="flex flex-col gap-4 h-full p-4 w-full"
          style={{ width: contentWidth }}
        >
          <div className="w-full">
            <SpanLabels span={span} />
            <SpanDatasets spanId={span.spanId} />
            <div className="pb-2 font-medium text-lg">Input</div>
            {isChatMessageList(span.input) ? (
              <ChatMessageListTab
                messages={span.input}
                presetKey={`input-${span.attributes['lmnr.span.path']}`}
              />
            ) : (
              <Formatter
                className="max-h-[400px]"
                collapsible
                value={JSON.stringify(span.input) + "a".repeat(100) + "\n".repeat(100)}
                presetKey={`input-${span.attributes['lmnr.span.path']}`}
              />
            )}
          </div>
          <div className="">
            <div className="pb-2 font-medium text-lg">Output</div>
            <Formatter
              className="max-h-[400px]"
              value={
                typeof span.output === 'string'
                  ? span.output
                  : JSON.stringify(span.output)
              }
              presetKey={`output-${span.attributes['lmnr.span.path']}`}
              collapsible
            />
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}
