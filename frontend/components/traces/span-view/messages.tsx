import { useVirtualizer, type VirtualItem } from "@tanstack/react-virtual";
import { type ModelMessage } from "ai";
import { isEqual, isNil } from "lodash";
import { ChevronDown } from "lucide-react";
import React, { memo, type Ref, useMemo, useRef } from "react";
import { type z } from "zod/v4";

import AnthropicContentParts from "@/components/traces/span-view/anthropic-parts";
import { MessageWrapper } from "@/components/traces/span-view/common";
import GeminiContentParts from "@/components/traces/span-view/gemini-parts";
import ContentParts from "@/components/traces/span-view/generic-parts";
import LangChainContentParts from "@/components/traces/span-view/langchain-parts";
import OpenAIContentParts from "@/components/traces/span-view/openai-parts";
import { useSpanSearchState } from "@/components/traces/span-view/span-search-context";
import { Button } from "@/components/ui/button";
import { convertToMessages } from "@/lib/spans/types";
import { type AnthropicMessagesSchema, parseAnthropicInput, parseAnthropicOutput } from "@/lib/spans/types/anthropic";
import { type GeminiContentsSchema, parseGeminiInput, parseGeminiOutput } from "@/lib/spans/types/gemini";
import { LangChainMessageSchema, LangChainMessagesSchema } from "@/lib/spans/types/langchain";
import { type OpenAIMessagesSchema, parseOpenAIInput, parseOpenAIOutput } from "@/lib/spans/types/openai";

const ANTHROPIC_CONTENT_TYPES = [
  '"type":"tool_use"',
  '"type":"tool_result"',
  '"type":"thinking"',
  '"type":"redacted_thinking"',
];

function hasAnthropicSignals(messages: unknown): boolean {
  if (!Array.isArray(messages)) return false;
  return messages.some((m: any) => {
    if (Array.isArray(m?.content)) {
      return m.content.some((b: any) => b?.type === "tool_use" || b?.type === "tool_result" || b?.type === "thinking");
    }
    if (typeof m?.content === "string") {
      return ANTHROPIC_CONTENT_TYPES.some((t) => m.content.includes(t));
    }
    return false;
  });
}

export type ProcessedMessages =
  | { type: "langchain"; messages: z.infer<typeof LangChainMessagesSchema> }
  | { type: "openai"; messages: z.infer<typeof OpenAIMessagesSchema> }
  | { type: "anthropic"; messages: z.infer<typeof AnthropicMessagesSchema> }
  | { type: "gemini"; messages: z.infer<typeof GeminiContentsSchema> }
  | { type: "generic"; messages: (Omit<ModelMessage, "role"> & { role?: ModelMessage["role"] })[] };

export function processMessages(data: unknown): ProcessedMessages {
  if (hasAnthropicSignals(data)) {
    const anthropicOutput = parseAnthropicOutput(data);
    if (anthropicOutput) {
      return { messages: anthropicOutput, type: "anthropic" };
    }

    const anthropicInput = parseAnthropicInput(data);
    if (anthropicInput) {
      return { messages: anthropicInput, type: "anthropic" };
    }
  }

  const openAIOutput = parseOpenAIOutput(data);
  if (openAIOutput) {
    return { messages: openAIOutput, type: "openai" };
  }

  const openAIInput = parseOpenAIInput(data);
  if (openAIInput) {
    return { messages: openAIInput, type: "openai" };
  }

  const langchainMessageResult = LangChainMessageSchema.safeParse(data);
  const langchainResult = LangChainMessagesSchema.safeParse(data);

  if (langchainMessageResult.success) {
    return {
      messages: [langchainMessageResult.data],
      type: "langchain",
    };
  }

  if (langchainResult.success) {
    return { messages: langchainResult.data, type: "langchain" };
  }

  const anthropicOutput = parseAnthropicOutput(data);
  if (anthropicOutput) {
    return { messages: anthropicOutput, type: "anthropic" };
  }

  const anthropicInput = parseAnthropicInput(data);
  if (anthropicInput) {
    return { messages: anthropicInput, type: "anthropic" };
  }

  const geminiOutput = parseGeminiOutput(data);
  if (geminiOutput) {
    return { messages: geminiOutput, type: "gemini" };
  }

  const geminiInput = parseGeminiInput(data);
  if (geminiInput) {
    return { messages: geminiInput, type: "gemini" };
  }

  return {
    messages: convertToMessages(data as Parameters<typeof convertToMessages>[0]),
    type: "generic",
  };
}

export function buildToolNameMap(result: ProcessedMessages): Map<string, string> {
  const map = new Map<string, string>();
  switch (result.type) {
    case "openai":
      for (const msg of result.messages) {
        if (msg.role === "assistant" && msg.tool_calls) {
          for (const tc of msg.tool_calls) {
            map.set(tc.id, tc.function.name);
          }
        }
      }
      break;
    case "anthropic":
      for (const msg of result.messages) {
        if (typeof msg.content !== "string") {
          for (const block of msg.content) {
            if ((block.type === "tool_use" || block.type === "server_tool_use") && "id" in block && "name" in block) {
              map.set(block.id, block.name);
            }
          }
        }
      }
      break;
    case "langchain":
      for (const msg of result.messages) {
        if ((msg.role === "assistant" || msg.role === "ai") && "tool_calls" in msg) {
          for (const tc of msg.tool_calls || []) {
            if (tc.id) {
              map.set(tc.id, tc.name);
            }
          }
        }
      }
      break;
  }
  return map;
}

export function renderMessageContent(
  result: ProcessedMessages,
  index: number,
  presetKey: string,
  toolNameMap?: Map<string, string>
) {
  const map = toolNameMap ?? buildToolNameMap(result);
  switch (result.type) {
    case "openai":
      return (
        <OpenAIContentParts
          parentIndex={index}
          presetKey={presetKey}
          message={result.messages[index]}
          toolNameMap={map}
        />
      );
    case "anthropic":
      return (
        <AnthropicContentParts
          parentIndex={index}
          presetKey={presetKey}
          message={result.messages[index]}
          toolNameMap={map}
        />
      );
    case "langchain":
      return (
        <LangChainContentParts
          parentIndex={index}
          presetKey={presetKey}
          message={result.messages[index]}
          toolNameMap={map}
        />
      );
    case "gemini":
      return <GeminiContentParts parentIndex={index} presetKey={presetKey} message={result.messages[index]} />;
    case "generic":
      return <ContentParts parentIndex={index} presetKey={presetKey} message={result.messages[index]} />;
  }
}

interface MessagesProps {
  messages: any;
  presetKey: string;
  hideScrollToBottom?: boolean;
  maxHeight?: number;
}

function PureMessages({ messages, presetKey, hideScrollToBottom = false, maxHeight }: MessagesProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const processedResult = useMemo(() => processMessages(messages), [messages]);
  const toolNameMap = useMemo(() => buildToolNameMap(processedResult), [processedResult]);

  const searchState = useSpanSearchState();
  const searchTerm = searchState?.searchTerm || "";

  const virtualizer = useVirtualizer({
    count: processedResult.messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 360,
    overscan: searchTerm ? 100 : 48,
  });

  const items = virtualizer.getVirtualItems();

  const scrollToBottom = () => {
    virtualizer.scrollToIndex(processedResult.messages.length - 1, {
      align: "end",
    });
  };

  return (
    <>
      <div
        ref={parentRef}
        className="size-full relative overflow-y-auto styled-scrollbar p-2"
        style={{
          contain: "strict",
          overflowAnchor: "none",
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
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${items[0]?.start ?? 0}px)`,
            }}
          >
            <MessagesRenderer
              {...processedResult}
              ref={virtualizer.measureElement}
              virtualItems={items}
              presetKey={presetKey}
              maxHeight={maxHeight}
              toolNameMap={toolNameMap}
            />
          </div>
        </div>
      </div>
      {!hideScrollToBottom && (
        <Button
          aria-label="Scroll to bottom"
          size="icon"
          className="absolute bottom-3 right-3 rounded-full"
          onClick={scrollToBottom}
        >
          <ChevronDown className="w-4 h-4" />
        </Button>
      )}
    </>
  );
}

const MessagesRenderer = ({
  messages,
  type,
  presetKey,
  ref,
  virtualItems,
  maxHeight,
  toolNameMap,
}: ProcessedMessages & {
  presetKey: string;
  virtualItems: VirtualItem[];
  ref: Ref<HTMLDivElement>;
  maxHeight?: number;
  toolNameMap: Map<string, string>;
}) => {
  switch (type) {
    case "openai":
      return virtualItems.map((row) => {
        const message = messages[row.index];
        return (
          <div key={row.key} data-index={row.index} ref={ref} className="pb-4">
            <MessageWrapper role={message.role} presetKey={`collapse-${row.index}-${presetKey}`} maxHeight={maxHeight}>
              <OpenAIContentParts
                parentIndex={row.index}
                presetKey={presetKey}
                message={message}
                toolNameMap={toolNameMap}
              />
            </MessageWrapper>
          </div>
        );
      });

    case "langchain":
      return virtualItems.map((row) => {
        const message = messages[row.index];
        return (
          <div key={row.key} data-index={row.index} ref={ref} className="pb-4">
            <MessageWrapper role={message.role} presetKey={`collapse-${row.index}-${presetKey}`} maxHeight={maxHeight}>
              <LangChainContentParts
                parentIndex={row.index}
                presetKey={presetKey}
                message={message}
                toolNameMap={toolNameMap}
              />
            </MessageWrapper>
          </div>
        );
      });

    case "anthropic":
      return virtualItems.map((row) => {
        const message = messages[row.index];
        return (
          <div key={row.key} data-index={row.index} ref={ref} className="pb-4">
            <MessageWrapper role={message.role} presetKey={`collapse-${row.index}-${presetKey}`} maxHeight={maxHeight}>
              <AnthropicContentParts
                parentIndex={row.index}
                presetKey={presetKey}
                message={message}
                toolNameMap={toolNameMap}
              />
            </MessageWrapper>
          </div>
        );
      });

    case "gemini":
      return virtualItems.map((row) => {
        const message = messages[row.index];
        return (
          <div key={row.key} data-index={row.index} ref={ref} className="pb-4">
            <MessageWrapper role={message.role} presetKey={`collapse-${row.index}-${presetKey}`} maxHeight={maxHeight}>
              <GeminiContentParts parentIndex={row.index} presetKey={presetKey} message={message} />
            </MessageWrapper>
          </div>
        );
      });

    case "generic":
      return virtualItems.map((row) => {
        const message = messages[row.index];
        return (
          <div key={row.key} data-index={row.index} ref={ref} className="pb-4">
            <MessageWrapper role={message.role} presetKey={`collapse-${row.index}-${presetKey}`} maxHeight={maxHeight}>
              <ContentParts parentIndex={row.index} presetKey={presetKey} message={message} />
            </MessageWrapper>
          </div>
        );
      });
  }
};
const Messages = memo(PureMessages, (prevProps, nextProps) => {
  if (isNil(prevProps.messages) && isNil(nextProps.messages)) return true;
  if (isNil(prevProps.messages) || isNil(nextProps.messages)) return false;
  if (prevProps.messages.length !== nextProps.messages.length) return false;
  return isEqual(prevProps.messages, nextProps.messages);
});
export default Messages;
