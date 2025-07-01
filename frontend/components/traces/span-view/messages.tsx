import { useVirtualizer, VirtualItem } from "@tanstack/react-virtual";
import { CoreMessage } from "ai";
import { isEqual } from "lodash";
import { ChevronDown } from "lucide-react";
import { memo, PropsWithChildren, Ref, useMemo, useRef } from "react";
import { z } from "zod/v4";

import ContentParts from "@/components/traces/span-view/generic-parts";
import LangChainContentParts from "@/components/traces/span-view/langchain-parts";
import OpenAIContentParts from "@/components/traces/span-view/openai-parts";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { convertToMessages } from "@/lib/spans/types";
import { LangChainMessageSchema, LangChainMessagesSchema } from "@/lib/spans/types/langchain";
import { OpenAIMessageSchema, OpenAIMessagesSchema } from "@/lib/spans/types/openai";

interface MessagesProps {
  messages: any;
  presetKey?: string;
}

function PureMessages({ children, messages, presetKey }: PropsWithChildren<MessagesProps>) {
  const parentRef = useRef<HTMLDivElement>(null);

  const processedResult = useMemo(() => {
    const openAIMessageResult = OpenAIMessageSchema.safeParse(messages);
    const openAIResult = OpenAIMessagesSchema.safeParse(messages);

    const langchainMessageResult = LangChainMessageSchema.safeParse(messages);
    const langchainResult = LangChainMessagesSchema.safeParse(messages);

    if (openAIMessageResult.success) {
      return {
        messages: [openAIMessageResult.data],
        type: "openai" as const,
      };
    }

    if (openAIResult.success) {
      return {
        messages: openAIResult.data,
        type: "openai" as const,
      };
    }

    if (langchainMessageResult.success) {
      return {
        messages: [langchainMessageResult.data],
        type: "langchain" as const,
      };
    }

    if (langchainResult.success) {
      return { messages: langchainResult.data, type: "langchain" as const };
    }

    return {
      messages: convertToMessages(messages),
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
          {processedResult.type}
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
        aria-label="Scroll to bottom"
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
  | { type: "langchain"; messages: z.infer<typeof LangChainMessagesSchema> }
  | { type: "openai"; messages: z.infer<typeof OpenAIMessagesSchema> }
  | { type: "generic"; messages: (Omit<CoreMessage, "role"> & { role?: CoreMessage["role"] })[] };

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
          <div key={row.key} ref={ref} data-index={row.index} className="flex flex-col border rounded mb-4 divide-y">
            <OpenAIContentParts presetKey={presetKey} message={message} />
          </div>
        );
      });

    case "langchain":
      return virtualItems.map((row) => {
        const message = messages[row.index];
        return (
          <div key={row.key} ref={ref} data-index={row.index} className="flex flex-col border rounded mb-4 divide-y">
            <LangChainContentParts presetKey={presetKey} message={message} />
          </div>
        );
      });

    case "generic":
      return virtualItems.map((row) => {
        const message = messages[row.index];
        return (
          <div key={row.key} ref={ref} data-index={row.index} className="flex flex-col border rounded mb-4 divide-y">
            <ContentParts presetKey={presetKey} message={message} />
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
