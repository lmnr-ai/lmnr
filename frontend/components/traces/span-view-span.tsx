import { isChatMessageList } from '@/lib/flow/utils';
import { Span } from '@/lib/traces/types';
import { useEffect, useRef, useState } from 'react';

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
  const [contentWidth, setContentWidth] = useState<number | undefined>();

  useEffect(() => {
    const updateWidth = () => {
      if (scrollAreaRef.current) {
        setContentWidth(scrollAreaRef.current.offsetWidth);
      }
    };

    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  return (
    <ScrollArea ref={scrollAreaRef} className="w-full h-full mt-0" type="scroll">
      <div className="max-h-0">
        <div
          className="flex flex-col gap-4 h-full p-4"
          style={{ width: contentWidth ? `${contentWidth}px` : '100%' }}
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
                value={JSON.stringify(span.input)}
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
