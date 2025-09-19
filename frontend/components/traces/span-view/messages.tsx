import { useVirtualizer, VirtualItem } from "@tanstack/react-virtual";
import { ModelMessage } from "ai";
import { isEqual } from "lodash";
import { ChevronDown } from "lucide-react";
import React, { memo, PropsWithChildren, Ref, useMemo, useRef } from "react";
import { z } from "zod/v4";

import { MessageWrapper } from "@/components/traces/span-view/common";
import ContentParts from "@/components/traces/span-view/generic-parts";
import LangChainContentParts from "@/components/traces/span-view/langchain-parts";
import OpenAIContentParts from "@/components/traces/span-view/openai-parts";
import { createStorageKey } from "@/components/traces/span-view/span-view-store";
import { useOptionalTraceViewStoreContext } from "@/components/traces/trace-view/trace-view-store.tsx";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { convertToMessages } from "@/lib/spans/types";
import { LangChainMessageSchema, LangChainMessagesSchema } from "@/lib/spans/types/langchain";
import { OpenAIMessageSchema, OpenAIMessagesSchema } from "@/lib/spans/types/openai";

interface MessagesProps {
  messages: any;
  spanPath: string;
  type: "input" | "output";
}

function PureMessages({ children, messages, type, spanPath }: PropsWithChildren<MessagesProps>) {
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

  const { search } = useOptionalTraceViewStoreContext(
    (state) => ({
      search: state.search,
    }),
    { search: "" }
  );

  const virtualizer = useVirtualizer({
    count: processedResult.messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 500,
    overscan: search ? 128 : 32,
    gap: 16,
  });

  const items = virtualizer.getVirtualItems();

  const scrollToFn = () => {
    const scrollElement = parentRef.current;
    if (scrollElement) {
      requestAnimationFrame(() => {
        const currentScrollTop = scrollElement.scrollTop;
        const maxScrollTop = scrollElement.scrollHeight - scrollElement.clientHeight;

        if (maxScrollTop - currentScrollTop > 50) {
          scrollElement.scrollTo({
            top: scrollElement.scrollHeight,
            behavior: "instant",
          });
        }
      });
    }
  };

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
            spanType={type}
            spanPath={spanPath}
          />
          {children}
        </div>
      </div>
      <Button
        aria-label="Scroll to bottom"
        size="icon"
        className="absolute bottom-3 right-3 rounded-full"
        onClick={scrollToFn}
      >
        <ChevronDown className="w-4 h-4" />
      </Button>
    </ScrollArea>
  );
}

type MessageRendererProps =
  | { type: "langchain"; messages: z.infer<typeof LangChainMessagesSchema> }
  | { type: "openai"; messages: z.infer<typeof OpenAIMessagesSchema> }
  | { type: "generic"; messages: (Omit<ModelMessage, "role"> & { role?: ModelMessage["role"] })[] };

const MessagesRenderer = ({
  messages,
  type,
  spanType,
  spanPath,
  ref,
  virtualItems,
}: MessageRendererProps & {
  spanPath: string;
  spanType: "input" | "output";
  virtualItems: VirtualItem[];
  ref: Ref<HTMLDivElement>;
}) => {
  switch (type) {
    case "openai":
      return virtualItems.map((row) => {
        const message = messages[row.index];
        return (
          <div key={row.key} data-index={row.index} ref={ref}>
            <MessageWrapper
              role={message.role}
              presetKey={createStorageKey.collapse(spanType, `${row.index}-${spanPath}`)}
            >
              <OpenAIContentParts parentIndex={row.index} type={spanType} spanPath={spanPath} message={message} />
            </MessageWrapper>
          </div>
        );
      });

    case "langchain":
      return virtualItems.map((row) => {
        const message = messages[row.index];
        return (
          <div key={row.key} data-index={row.index} ref={ref}>
            <MessageWrapper
              role={message.role}
              presetKey={createStorageKey.collapse(spanType, `${row.index}-${spanPath}`)}
            >
              <LangChainContentParts parentIndex={row.index} type={spanType} spanPath={spanPath} message={message} />
            </MessageWrapper>
          </div>
        );
      });

    case "generic":
      return virtualItems.map((row) => {
        const message = messages[row.index];
        return (
          <div key={row.key} data-index={row.index} ref={ref}>
            <MessageWrapper
              role={message.role}
              presetKey={createStorageKey.collapse(spanType, `${row.index}-${spanPath}`)}
            >
              <ContentParts parentIndex={row.index} type={spanType} spanPath={spanPath} message={message} />
            </MessageWrapper>
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
