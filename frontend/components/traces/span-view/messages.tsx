import { useVirtualizer } from "@tanstack/react-virtual";
import { type ModelMessage } from "ai";
import { isEqual, isNil } from "lodash";
import { ChevronDown } from "lucide-react";
import React, { memo, useCallback, useMemo, useRef } from "react";
import { type z } from "zod/v4";

import AnthropicContentParts from "@/components/traces/span-view/anthropic-parts";
import { getRoleColors, MessageWrapper } from "@/components/traces/span-view/common";
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

const ANTHROPIC_SIGNAL_TYPES = new Set(["tool_use", "tool_result", "thinking", "redacted_thinking"]);

function contentHasAnthropicTypes(blocks: unknown): boolean {
  if (!Array.isArray(blocks)) return false;
  return blocks.some((b: any) => ANTHROPIC_SIGNAL_TYPES.has(b?.type));
}

function hasAnthropicSignals(messages: unknown): boolean {
  if (!Array.isArray(messages)) return false;
  return messages.some((m: any) => {
    if (Array.isArray(m?.content)) {
      return contentHasAnthropicTypes(m.content);
    }
    if (typeof m?.content === "string") {
      try {
        return contentHasAnthropicTypes(JSON.parse(m.content));
      } catch {
        return false;
      }
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

const HEADER_HEIGHT = 28;

function updateOverlay(
  overlayEl: HTMLDivElement | null,
  labelEl: HTMLSpanElement | null,
  role: string | undefined,
  show: boolean
) {
  if (!overlayEl || !labelEl) return;
  if (!show || !role) {
    overlayEl.style.opacity = "0";
    overlayEl.style.pointerEvents = "none";
    return;
  }
  const colors = getRoleColors(role);
  overlayEl.style.opacity = "1";
  overlayEl.style.pointerEvents = "auto";
  labelEl.style.color = colors.badgeText;
  labelEl.textContent = role.charAt(0).toUpperCase() + role.slice(1);
}

function PureMessages({ messages, presetKey, hideScrollToBottom = false, maxHeight }: MessagesProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);

  const processedResult = useMemo(() => processMessages(messages), [messages]);
  const toolNameMap = useMemo(() => buildToolNameMap(processedResult), [processedResult]);

  const searchState = useSpanSearchState();
  const searchTerm = searchState?.searchTerm || "";

  const prevOverlayRef = useRef<{ role?: string; show: boolean }>({ show: false });

  const virtualizer = useVirtualizer({
    count: processedResult.messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 360,
    overscan: searchTerm ? 100 : 24,
  });

  const items = virtualizer.getVirtualItems();

  const handleScroll = useCallback(() => {
    const el = parentRef.current;
    if (!el) return;

    const scrollTop = el.scrollTop;
    const cache = virtualizer.measurementsCache;

    let role: string | undefined;
    let show = false;

    let lo = 0;
    let hi = cache.length - 1;
    let found = -1;

    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      if (cache[mid].start <= scrollTop) {
        found = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    if (found >= 0) {
      const message = processedResult.messages[found] as { role?: string };
      role = message?.role;
      const itemStart = cache[found].start;
      const itemEnd = cache[found].end;
      // Show overlay slightly before the header fully scrolls out of view,
      // keep it through the padding gap, hide when next card's header appears.
      const nextStart = found + 1 < cache.length ? cache[found + 1].start : itemEnd;
      show = scrollTop > itemStart + HEADER_HEIGHT * 0.1 && scrollTop < nextStart - HEADER_HEIGHT * 1.5;
    }

    const prev = prevOverlayRef.current;
    if (prev.role !== role || prev.show !== show) {
      prevOverlayRef.current = { role, show };
      updateOverlay(overlayRef.current, labelRef.current, role, show);
    }
  }, [processedResult.messages, virtualizer]);

  const scrollToBottom = useCallback(() => {
    virtualizer.scrollToIndex(processedResult.messages.length - 1, {
      align: "end",
    });
  }, [processedResult.messages.length, virtualizer]);

  return (
    <>
      <div className="size-full relative">
        <div
          className="absolute top-0 left-0 right-0 z-20 bg-background transition-opacity duration-150"
          ref={overlayRef}
          style={{ opacity: 0, pointerEvents: "none" }}
        >
          <div className="mx-2 flex items-center px-2 py-1 gap-2 border bg-background rounded-t shadow-sm">
            <span ref={labelRef} className="text-sm font-medium" />
          </div>
        </div>
        <div
          ref={parentRef}
          onScroll={handleScroll}
          className="size-full overflow-y-auto styled-scrollbar px-2"
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
              {items.map((item) => {
                const message = processedResult.messages[item.index] as { role?: string };
                return (
                  <div key={item.key} data-index={item.index} ref={virtualizer.measureElement} className="pb-4">
                    <MessageWrapper
                      role={message?.role}
                      presetKey={`collapse-${item.index}-${presetKey}`}
                      maxHeight={maxHeight}
                      stickyHeader={false}
                    >
                      {renderMessageContent(processedResult, item.index, presetKey, toolNameMap)}
                    </MessageWrapper>
                  </div>
                );
              })}
            </div>
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
const Messages = memo(PureMessages, (prevProps, nextProps) => {
  if (isNil(prevProps.messages) && isNil(nextProps.messages)) return true;
  if (isNil(prevProps.messages) || isNil(nextProps.messages)) return false;
  if (prevProps.messages.length !== nextProps.messages.length) return false;
  return isEqual(prevProps.messages, nextProps.messages);
});
export default Messages;
