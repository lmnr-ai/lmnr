import { useVirtualizer, VirtualItem } from "@tanstack/react-virtual";
import { CoreMessage } from "ai";
import { isEqual } from "lodash";
import { ChevronDown } from "lucide-react";
import { memo, PropsWithChildren, Ref, useMemo, useRef } from "react";
import { z } from "zod";

import ContentParts from "@/components/traces/span-view/generic-parts";
import OpenAIContentParts from "@/components/traces/span-view/openai-parts";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { OpenAIMessageSchema, OpenAIMessagesSchema } from "@/lib/spans/types";
import { flattenContentOfMessages } from "@/lib/types";

interface MessagesProps {
  messages: any;
  presetKey?: string;
}

function PureMessages({ children, messages, presetKey }: PropsWithChildren<MessagesProps>) {
  const parentRef = useRef<HTMLDivElement>(null);

  const processedResult = useMemo(() => {
    const openAIMessageResult = OpenAIMessageSchema.safeParse(messages);
    const openAIResult = OpenAIMessagesSchema.safeParse(messages);

    if (openAIMessageResult.success) {
      return {
        messages: [openAIMessageResult.data] as z.infer<typeof OpenAIMessagesSchema>,
        type: "openai" as const,
      };
    }

    if (openAIResult.success) {
      return {
        messages: openAIResult.data,
        type: "openai" as const,
      };
    }

    return {
      messages: flattenContentOfMessages(messages),
      type: "generic" as const,
    };
  }, [messages]);

  const virtualizer = useVirtualizer({
    count: processedResult.messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 500,
    overscan: 16,
    gap: 16,
  });

  const items = virtualizer.getVirtualItems();

  return (
    <ScrollArea
      ref={parentRef}
      className="h-full relative"
      style={{
        width: "100%",
        contain: "strict",
      }}
    >
      <div
        style={{
          height: virtualizer.getTotalSize(),
          width: "100%",
          position: "relative",
        }}
      >
        <div
          style={{
            transform: `translateY(${items[0]?.start ?? 0}px)`,
          }}
          className="p-4 absolute top-0 left-0 w-full"
        >
          <MessagesRenderer
            {...processedResult}
            ref={virtualizer.measureElement}
            virtualItems={items}
            presetKey={presetKey}
          />
          {children}
        </div>
      </div>
      <Button
        variant="outline"
        size="icon"
        className="absolute bottom-3 right-3 rounded-full"
        onClick={() => virtualizer.scrollToIndex(messages.length - 1, { align: "end" })}
      >
        <ChevronDown className="w-4 h-4" />
      </Button>
    </ScrollArea>
  );
}

type MessageRendererProps =
  | { type: "openai"; messages: z.infer<typeof OpenAIMessagesSchema> }
  | { type: "generic"; messages: CoreMessage[] };

const MessagesRenderer = ({
  messages,
  type,
  presetKey,
  ref,
  virtualItems,
}: MessageRendererProps & {
  presetKey?: string;
  virtualItems: VirtualItem[];
  ref: Ref<HTMLDivElement>;
}) => {
  switch (type) {
    case "openai":
      return virtualItems.map((row) => {
        const message = messages[row.index];
        return (
          <div key={row.key} ref={ref} data-index={row.index} className="flex flex-col border rounded mb-4">
            <div className="font-medium text-sm text-secondary-foreground p-2 border-b">
              {message.role.toUpperCase()}
            </div>
            <OpenAIContentParts presetKey={presetKey} message={message} />
          </div>
        );
      });
    case "generic":
      return virtualItems.map((row) => {
        const message = messages[row.index];
        return (
          <div key={row.key} ref={ref} data-index={row.index} className="flex flex-col border rounded mb-4">
            {message?.role && (
              <div className="font-medium text-sm text-secondary-foreground p-2 border-b">
                {message.role.toUpperCase()}
              </div>
            )}
            <ContentParts presetKey={presetKey} content={message.content} />
          </div>
        );
      });
  }
};
const Messages = memo(PureMessages, (prevProps, nextProps) => {
  if (prevProps.messages.length !== nextProps.messages.length) return false;
  return isEqual(prevProps.messages, nextProps.messages);
});

export default Messages;
