import { useState } from 'react';

import { isChatMessageList } from '@/lib/flow/utils';
import { Span } from '@/lib/traces/types';

import Formatter from '../ui/formatter';
import { ScrollArea } from '../ui/scroll-area';
import ChatMessageListTab from './chat-message-list-tab';

interface SpanViewSpanProps {
  span: Span;
}

export function SpanViewSpan({ span }: SpanViewSpanProps) {
  const [spanInput, setSpanInput] = useState(span.input);
  const [spanOutput, setSpanOutput] = useState(span.output);

  if (span.inputUrl) {
    const url = span.inputUrl.startsWith('/')
      ? `${span.inputUrl}?payloadType=raw`
      : span.inputUrl;
    fetch(url).then(response => {
      response.json().then(j => {
        setSpanInput(j);
      });
    });
  }

  if (span.outputUrl) {
    const url = span.outputUrl.startsWith('/')
      ? `${span.outputUrl}?payloadType=raw`
      : span.outputUrl;
    fetch(url).then(response => {
      response.json().then(j => {
        setSpanOutput(j);
      });
    });
  }

  return (
    <ScrollArea className="w-full h-full mt-0">
      <div className="max-h-0">
        <div
          className="flex flex-col gap-4 h-full p-4 w-full"
        >
          <div className="w-full">
            {/* <SpanLabels span={span} />
            <SpanDatasets spanId={span.spanId} /> */}
            <div className="pb-2 font-medium text-lg">Input</div>
            {isChatMessageList(spanInput) ? (
              <ChatMessageListTab
                messages={spanInput}
                presetKey={`input-${span.attributes['lmnr.span.path'].join('.')}`}
              />
            ) : (
              <Formatter
                className="max-h-[400px]"
                collapsible
                value={
                  typeof spanInput === 'string'
                    ? spanInput
                    : JSON.stringify(spanInput)
                }
                presetKey={`input-${span.attributes['lmnr.span.path'].join('.')}`}
              />
            )}
          </div>
          <div className="">
            <div className="pb-2 font-medium text-lg">Output</div>
            <Formatter
              className="max-h-[400px]"
              value={
                typeof spanOutput === 'string'
                  ? spanOutput
                  : JSON.stringify(spanOutput)
              }
              presetKey={`output-${span.attributes['lmnr.span.path'].join('.')}`}
              collapsible
            />
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}
