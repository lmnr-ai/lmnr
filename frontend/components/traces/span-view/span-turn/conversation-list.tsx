import { useVirtualizer } from "@tanstack/react-virtual";
import { memo, useMemo, useRef } from "react";

import { MessageWrapper } from "@/components/traces/span-view/common";
import MessageLabelRow from "@/components/traces/span-view/message-label-row";
import { buildToolNameMap, renderMessageContent } from "@/components/traces/span-view/messages";
import { useSpanSearchState } from "@/components/traces/span-view/span-search-context";
import { canonicalRole, segmentMessageRole } from "@/lib/spans/turn";
import { pluralize } from "@/lib/utils";

import { type ConversationRow, type NewInputStyle, type SectionKey } from "./build-rows";
import ContextHeader from "./context-header";
import NewInputFrame from "./new-input-frame";
import NormalizedParts from "./normalized-parts";
import SectionHeader, { type SectionFormat } from "./section-header";

const SECTION_TITLES: Record<SectionKey, string> = { input: "Input", output: "Output" };
const SECTION_INFO: Partial<Record<SectionKey, string>> = {
  input:
    "Each LLM call re-sends the whole conversation. Earlier steps are collapsed, and the marked part is what is new in this call.",
};

const TOGGLE_ESTIMATE_SIZE = 40;
const MESSAGE_ESTIMATE_SIZE = 240;

interface ConversationListProps {
  rows: ConversationRow[];
  compact: boolean;
  resultPreviews: boolean;
  newInputStyle: NewInputStyle;
  /** Messages without cards (Focused "Flat"). */
  bare: boolean;
  formats: Record<SectionKey, SectionFormat>;
  presetKey: string;
  onToggleHistory: () => void;
}

const ConversationList = ({
  rows,
  compact,
  resultPreviews,
  newInputStyle,
  bare,
  formats,
  presetKey,
  onToggleHistory,
}: ConversationListProps) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const searchTerm = useSpanSearchState()?.searchTerm ?? "";

  // Only provider-rendered (non-normalized) rows read this map.
  const toolNameMap = useMemo(() => {
    if (!rows.some((row) => row.kind === "message" && !row.normalized)) return undefined;
    const segments = new Set(rows.flatMap((row) => (row.kind === "message" ? [row.segment] : [])));
    return new Map([...segments].flatMap((segment) => [...buildToolNameMap(segment)]));
  }, [rows]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => (rows[i]?.kind === "message" ? MESSAGE_ESTIMATE_SIZE : TOGGLE_ESTIMATE_SIZE),
    getItemKey: (i) => rows[i]?.key ?? i,
    overscan: searchTerm ? 100 : 10,
  });
  const items = virtualizer.getVirtualItems();

  return (
    <div
      ref={parentRef}
      className="size-full overflow-y-auto styled-scrollbar scrollbar-gutter-stable px-2"
      style={{ contain: "strict" }}
    >
      <div style={{ height: virtualizer.getTotalSize(), width: "100%", position: "relative" }}>
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
            const row = rows[item.index];
            if (row.kind === "section") {
              return (
                <div key={row.key} data-index={item.index} ref={virtualizer.measureElement}>
                  <SectionHeader
                    title={SECTION_TITLES[row.section]}
                    summary={row.summary}
                    info={row.info ? SECTION_INFO[row.section] : undefined}
                    messageIndex={item.index}
                    first={item.index === 0}
                    {...formats[row.section]}
                  />
                </div>
              );
            }
            if (row.kind === "context") {
              return (
                <div key={row.key} data-index={item.index} ref={virtualizer.measureElement}>
                  <ContextHeader
                    summary={row.summary}
                    open={row.open}
                    onToggle={onToggleHistory}
                    copyText={formats.input.value}
                  />
                </div>
              );
            }
            if (row.kind === "new-input") {
              return (
                <div
                  key={row.key}
                  data-index={item.index}
                  ref={virtualizer.measureElement}
                  className="flex items-center gap-1.5 px-1 pb-3 text-xs"
                >
                  <span className="font-medium text-secondary-foreground">{row.label.title}</span>
                  {row.label.detail && <span className="text-muted-foreground">· {row.label.detail}</span>}
                  <div className="flex-1 ml-1 border-t border-dashed" />
                </div>
              );
            }
            if (row.kind === "toggle") {
              return (
                // Bottom-only spacing, like message rows, so the gaps above and below the toggle match.
                <div key={row.key} data-index={item.index} ref={virtualizer.measureElement} className="pb-4">
                  <MessageLabelRow text={row.text} open={row.open} onToggle={onToggleHistory} />
                </div>
              );
            }
            const parts = row.normalized?.parts;
            // Anthropic sends tool results as `user` messages; label them by what they are.
            const role = parts?.every((p) => p.kind === "tool-result")
              ? "tool"
              : (row.normalized?.role ?? segmentMessageRole(row.segment, row.localIndex));
            const card = (
              <MessageWrapper
                role={canonicalRole(role)}
                suffix={row.resultCount ? pluralize(row.resultCount, "result", "results") : undefined}
                presetKey={presetKey}
                maxHeight={row.maxHeight}
                defaultExpanded={row.defaultExpanded}
                stickyHeader={false}
                bare={bare}
              >
                {row.normalized ? (
                  <NormalizedParts
                    parts={row.normalized.parts}
                    compact={compact}
                    resultPreviews={resultPreviews || !!row.plainResults}
                    plainResults={row.plainResults}
                    expandReasoning={row.source === "output"}
                    presetKey={presetKey}
                    messageIndex={item.index}
                  />
                ) : (
                  renderMessageContent(row.segment, row.localIndex, item.index, presetKey, toolNameMap)
                )}
              </MessageWrapper>
            );
            return (
              <div
                key={row.key}
                data-index={item.index}
                ref={virtualizer.measureElement}
                className={row.newInput && newInputStyle !== "divider" ? undefined : "pb-4"}
              >
                {row.newInput && newInputStyle !== "divider" ? (
                  <NewInputFrame style={newInputStyle} position={row.newInput}>
                    {card}
                  </NewInputFrame>
                ) : (
                  card
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default memo(ConversationList);
