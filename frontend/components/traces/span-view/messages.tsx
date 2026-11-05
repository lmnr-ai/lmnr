import { useVirtualizer } from "@tanstack/react-virtual";
import { isEqual, isNil } from "lodash";
import { ChevronDown } from "lucide-react";
import React, { memo, useCallback, useMemo, useRef } from "react";

import AnthropicContentParts from "@/components/traces/span-view/anthropic-parts";
import { getRoleTextColor, MessageWrapper } from "@/components/traces/span-view/common";
import GeminiContentParts from "@/components/traces/span-view/gemini-parts";
import ContentParts from "@/components/traces/span-view/generic-parts";
import LangChainContentParts from "@/components/traces/span-view/langchain-parts";
import MessageLabelRow, { type MessageLabel } from "@/components/traces/span-view/message-label-row";
import OpenAIContentParts from "@/components/traces/span-view/openai-parts";
import OpenAIResponsesContentParts from "@/components/traces/span-view/openai-responses-parts";
import { useSpanSearchState } from "@/components/traces/span-view/span-search-context";
import { Button } from "@/components/ui/button";
import { ElevatedSurface } from "@/components/ui/surface";
// Detection logic lives in `lib/spans/process-messages.ts` (a plain TS module)
// so tests can import it without pulling component CSS into the module graph.
import { type ProcessedMessages, processMessages } from "@/lib/spans/process-messages";
import { segmentMessageRole } from "@/lib/spans/turn";

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
    case "openai-responses":
      for (const item of result.messages) {
        switch (item.type) {
          case "function_call":
            map.set(item.call_id, item.name);
            break;
          case "computer_call":
            map.set(item.call_id, "computer_use");
            break;
          case "local_shell_call":
            // local_shell_call_output has no call_id in the API — its `id` field
            // references the call's `call_id`. Register both to be resilient to
            // either convention.
            map.set(item.call_id, "local_shell");
            map.set(item.id, "local_shell");
            break;
          case "mcp_call":
            map.set(
              item.id,
              item.server_label && item.name ? `${item.server_label}.${item.name}` : (item.name ?? "mcp_call")
            );
            break;
          case "web_search_call":
            map.set(item.id, "web_search");
            break;
          case "file_search_call":
            map.set(item.id, "file_search");
            break;
          case "image_generation_call":
            map.set(item.id, "image_generation");
            break;
          case "code_interpreter_call":
            map.set(item.id, "code_interpreter");
            break;
          case "mcp_approval_request":
            map.set(
              item.id,
              item.server_label && item.name
                ? `${item.server_label}.${item.name}`
                : (item.name ?? "mcp_approval_request")
            );
            break;
          case "custom_tool_call":
            map.set(item.call_id, item.name);
            break;
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

// `index` locates the message within `result`; `parentIndex` is its position in the rendered list, which
// differs when several segments are concatenated (span turn) and keys per-part presets and search order.
export function renderMessageContent(
  result: ProcessedMessages,
  index: number,
  parentIndex: number,
  presetKey: string,
  toolNameMap?: Map<string, string>
) {
  const map = toolNameMap ?? buildToolNameMap(result);
  switch (result.type) {
    case "openai":
      return (
        <OpenAIContentParts
          parentIndex={parentIndex}
          presetKey={presetKey}
          message={result.messages[index]}
          toolNameMap={map}
        />
      );
    case "openai-responses":
      return (
        <OpenAIResponsesContentParts
          parentIndex={parentIndex}
          presetKey={presetKey}
          message={result.messages[index]}
          toolNameMap={map}
        />
      );
    case "anthropic":
      return (
        <AnthropicContentParts
          parentIndex={parentIndex}
          presetKey={presetKey}
          message={result.messages[index]}
          toolNameMap={map}
        />
      );
    case "langchain":
      return (
        <LangChainContentParts
          parentIndex={parentIndex}
          presetKey={presetKey}
          message={result.messages[index]}
          toolNameMap={map}
        />
      );
    case "gemini":
      return <GeminiContentParts parentIndex={parentIndex} presetKey={presetKey} message={result.messages[index]} />;
    case "generic":
      return <ContentParts parentIndex={parentIndex} presetKey={presetKey} message={result.messages[index]} />;
  }
}

export type { MessageLabel };

/** Pre-detected messages rendered in their own format, with per-segment collapse settings. */
export interface MessageSegment {
  /** Stable across re-renders so rows keep their expanded state when segments are inserted. */
  key: string;
  processed: ProcessedMessages;
  maxHeight?: number;
  defaultExpanded?: boolean;
}

interface MessagesProps {
  messages?: any;
  presetKey: string;
  hideScrollToBottom?: boolean;
  maxHeight?: number;
  labels?: MessageLabel[];
  // When set, detection on `messages` is skipped.
  segments?: MessageSegment[];
  defaultExpanded?: boolean;
}

type VirtualItem =
  | { kind: "label"; label: MessageLabel; key: string }
  | { kind: "message"; index: number; key: string };

// A message addressed by its segment and its index within that segment.
interface MessageEntry {
  segment: MessageSegment;
  localIndex: number;
}

const messageRole = ({ segment, localIndex }: MessageEntry): string | undefined =>
  segmentMessageRole(segment.processed, localIndex);

const HEADER_HEIGHT = 28;
const LABEL_ESTIMATE_SIZE = 40;
const MESSAGE_ESTIMATE_SIZE = 360;

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
  overlayEl.style.opacity = "1";
  overlayEl.style.pointerEvents = "auto";
  labelEl.style.color = getRoleTextColor(role);
  labelEl.textContent = role.charAt(0).toUpperCase() + role.slice(1);
}

function PureMessages({
  messages,
  presetKey,
  hideScrollToBottom = false,
  maxHeight,
  labels,
  segments: segmentsProp,
  defaultExpanded = false,
}: MessagesProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);

  const segments = useMemo(
    () => segmentsProp ?? [{ key: "messages", processed: processMessages(messages) }],
    [segmentsProp, messages]
  );
  const entries: MessageEntry[] = useMemo(
    () => segments.flatMap((segment) => segment.processed.messages.map((_, localIndex) => ({ segment, localIndex }))),
    [segments]
  );
  const toolNameMap = useMemo(
    () => new Map(segments.flatMap((segment) => [...buildToolNameMap(segment.processed)])),
    [segments]
  );

  const searchState = useSpanSearchState();
  const searchTerm = searchState?.searchTerm || "";

  const prevOverlayRef = useRef<{ role?: string; show: boolean }>({ show: false });

  // Interleave label rows with message rows so labels stay aligned with the
  // messages they introduce and don't break overscan / measurement.
  const virtualItems: VirtualItem[] = useMemo(() => {
    const items: VirtualItem[] = [];
    const labelsByIndex = new Map<number, MessageLabel[]>();
    if (labels) {
      for (const label of labels) {
        const arr = labelsByIndex.get(label.beforeIndex) ?? [];
        arr.push(label);
        labelsByIndex.set(label.beforeIndex, arr);
      }
    }
    for (let i = 0; i <= entries.length; i++) {
      const here = labelsByIndex.get(i);
      if (here) {
        for (const label of here) {
          items.push({ kind: "label", label, key: `label-${label.text}` });
        }
      }
      if (i < entries.length) {
        const { segment, localIndex } = entries[i];
        items.push({ kind: "message", index: i, key: `msg-${segment.key}-${localIndex}` });
      }
    }
    return items;
  }, [labels, entries]);

  const virtualizer = useVirtualizer({
    count: virtualItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => (virtualItems[i]?.kind === "label" ? LABEL_ESTIMATE_SIZE : MESSAGE_ESTIMATE_SIZE),
    getItemKey: (i) => virtualItems[i]?.key ?? i,
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
      const virtualItem = virtualItems[found];
      if (virtualItem?.kind === "message") {
        role = messageRole(entries[virtualItem.index]);
      }
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
  }, [entries, virtualItems, virtualizer]);

  const scrollToBottom = useCallback(() => {
    virtualizer.scrollToIndex(virtualItems.length - 1, {
      align: "end",
    });
  }, [virtualItems.length, virtualizer]);

  return (
    <>
      <div className="size-full relative">
        <div
          // adjust for scrollbar on the right
          className="absolute top-0 left-0 right-[15px] z-20 bg-surface transition-opacity duration-150"
          ref={overlayRef}
          style={{ opacity: 0, pointerEvents: "none" }}
        >
          <ElevatedSurface offset={1} className="mx-2 flex items-center px-2 py-1 gap-2 border rounded-t-lg">
            <span ref={labelRef} className="text-sm font-medium" />
          </ElevatedSurface>
        </div>
        <div
          ref={parentRef}
          onScroll={handleScroll}
          className="size-full overflow-y-auto styled-scrollbar scrollbar-gutter-stable px-2"
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
                const virtualItem = virtualItems[item.index];
                if (!virtualItem) return null;
                if (virtualItem.kind === "label") {
                  return (
                    <div
                      key={virtualItem.key}
                      data-index={item.index}
                      ref={virtualizer.measureElement}
                      className="pt-2 pb-2 px-1"
                    >
                      <MessageLabelRow {...virtualItem.label} />
                    </div>
                  );
                }
                const messageIndex = virtualItem.index;
                const entry = entries[messageIndex];
                return (
                  <div key={virtualItem.key} data-index={item.index} ref={virtualizer.measureElement} className="pb-4">
                    <MessageWrapper
                      role={messageRole(entry)}
                      presetKey={`collapse-${messageIndex}-${presetKey}`}
                      maxHeight={entry.segment.maxHeight ?? maxHeight}
                      stickyHeader={false}
                      defaultExpanded={entry.segment.defaultExpanded ?? defaultExpanded}
                    >
                      {renderMessageContent(
                        entry.segment.processed,
                        entry.localIndex,
                        messageIndex,
                        presetKey,
                        toolNameMap
                      )}
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
          className="absolute bottom-3 right-3 rounded-full z-40"
          onClick={scrollToBottom}
        >
          <ChevronDown className="w-4 h-4" />
        </Button>
      )}
    </>
  );
}
const Messages = memo(PureMessages, (prevProps, nextProps) => {
  if (prevProps.segments !== nextProps.segments) return false;
  if (prevProps.defaultExpanded !== nextProps.defaultExpanded) return false;
  if (prevProps.maxHeight !== nextProps.maxHeight) return false;
  if (!isEqual(prevProps.labels, nextProps.labels)) return false;
  if (isNil(prevProps.messages) && isNil(nextProps.messages)) return true;
  if (isNil(prevProps.messages) || isNil(nextProps.messages)) return false;
  if (prevProps.messages.length !== nextProps.messages.length) return false;
  return isEqual(prevProps.messages, nextProps.messages);
});
export default Messages;
