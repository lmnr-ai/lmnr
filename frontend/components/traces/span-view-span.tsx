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
  return (
    <div className="flex h-full w-full">
      <ScrollArea className="flex overflow-auto w-full mt-0">
        <div className="flex flex-col max-h-0">
          <div>
            <div className="p-4 w-full h-full">
              <SpanLabels span={span} />
              <SpanDatasets spanId={span.spanId} />
              <div className="pb-2 font-medium text-lg">Input</div>
              {isChatMessageList(span.input) ? (
                <ChatMessageListTab messages={span.input} />
              ) : (
                <Formatter
                  className="max-h-1/3"
                  collapsible
                  value={JSON.stringify(span.input)}
                />
              )}
            </div>
            <div className="p-4 w-full h-full">
              <div className="pb-2 font-medium text-lg">Output</div>
              <Formatter
                className="max-h-[600px]"
                value={
                  typeof span.output === 'string'
                    ? span.output
                    : JSON.stringify(span.output)
                }
                collapsible
              />
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
