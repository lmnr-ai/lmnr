import useSWR from 'swr';

import { useProjectContext } from '@/contexts/project-context';
import { Span } from '@/lib/traces/types';
import { swrFetcher } from '@/lib/utils';

import Formatter from '../ui/formatter';
import Renderer from '../ui/renderer';
import { ScrollArea } from '../ui/scroll-area';
import SpanDatasets from './span-datasets';
import SpanLabels from './span-labels';

interface SpanViewSpanProps {
  span: Span;
}

export function SpanViewSpan({ span }: SpanViewSpanProps) {
  const { projectId } = useProjectContext();
  const rendererId = '00000000-0000-0000-0000-000000000000';
  const { data } = useSWR<{ html: string }>(
    `/api/projects/${projectId}/renderers/${rendererId}`,
    swrFetcher
  );

  const userHtml = data?.html;

  return (
    <div className="flex h-full w-full">
      <ScrollArea className="flex overflow-auto w-full mt-0">
        <div className="flex flex-col max-h-0">
          <div>
            <div className="p-4 w-full h-full">
              <SpanLabels span={span} />
              <SpanDatasets spanId={span.spanId} />
              <div className="pb-2 font-medium text-lg">Input</div>
              <Renderer
                value={JSON.stringify(span.input)}
                userHtml={userHtml!}
              />
              {/* {isChatMessageList(span.input) ? (
                <ChatMessageListTab messages={span.input} />
              ) : (
                <Formatter
                  className="max-h-1/3"
                  collapsible
                  value={JSON.stringify(span.input)}
                />
              )} */}
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
