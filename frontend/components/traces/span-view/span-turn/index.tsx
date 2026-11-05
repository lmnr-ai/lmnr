import { memo, useCallback, useMemo, useState } from "react";

import { useSpanSearchState } from "@/components/traces/span-view/span-search-context";
import { buildSpanTurn } from "@/lib/spans/turn";
import { type Span } from "@/lib/traces/types";

import {
  buildConversationRows,
  buildFocusedRows,
  NEW_INPUT_STYLES,
  type NewInputStyle,
  RESULT_STYLES,
  type ResultStyle,
  TURN_LAYOUTS,
  type TurnLayout,
} from "./build-rows";
import ConversationList from "./conversation-list";
import OptionSwitcher, { readStoredOption } from "./option-switcher";
import { useSectionFormats } from "./use-section-formats";

const LAYOUT_KEY = "span-turn-layout";
const RESULTS_KEY = "span-turn-results";
const NEW_INPUT_KEY = "span-turn-new-input";
const MESSAGE_STYLE_KEY = "span-turn-message-style";
// Hidden for now; while off, stored choices are ignored so nobody stays stuck on a layout they can't switch back from.
const SHOW_VIEW_OPTIONS = true;

type MessageStyle = "cards" | "flat";
const MESSAGE_STYLES: { value: MessageStyle; label: string }[] = [
  { value: "cards", label: "Cards" },
  { value: "flat", label: "Flat" },
];

const PureSpanTurn = ({ span }: { span: Span }) => {
  const turn = useMemo(() => buildSpanTurn(span.input, span.output), [span.input, span.output]);
  const [layout, setLayout] = useState<TurnLayout>(() =>
    SHOW_VIEW_OPTIONS ? readStoredOption(LAYOUT_KEY, TURN_LAYOUTS, "focused") : "focused"
  );
  const [resultStyle, setResultStyle] = useState<ResultStyle>(() =>
    readStoredOption(RESULTS_KEY, RESULT_STYLES, "rows")
  );
  const [newInputStyle, setNewInputStyle] = useState<NewInputStyle>(() =>
    readStoredOption(NEW_INPUT_KEY, NEW_INPUT_STYLES, "divider")
  );
  const focused = layout === "focused";
  const [messageStyle, setMessageStyle] = useState<MessageStyle>(() =>
    SHOW_VIEW_OPTIONS ? readStoredOption(MESSAGE_STYLE_KEY, MESSAGE_STYLES, "cards") : "cards"
  );
  const compact = layout === "compact" || layout === "all" || focused;

  // Hidden history can't be searched, so a new search term opens it.
  const searchTerm = useSpanSearchState()?.searchTerm ?? "";
  const [historyOpen, setHistoryOpen] = useState(searchTerm.length > 0);
  const [prevSearchTerm, setPrevSearchTerm] = useState(searchTerm);
  if (searchTerm !== prevSearchTerm) {
    setPrevSearchTerm(searchTerm);
    if (searchTerm) setHistoryOpen(true);
  }
  const toggleHistory = useCallback(() => setHistoryOpen((open) => !open), []);

  const spanPath = span.attributes?.["lmnr.span.path"] ?? [span.name];
  const pathKey = (typeof spanPath === "string" ? spanPath.split(".") : spanPath).join(".");
  const presetKey = `messages-${pathKey}`;
  const formats = useSectionFormats(span, turn, pathKey);

  const rawInput = formats.input.mode !== "messages";
  const rawOutput = formats.output.mode !== "messages";
  const rows = useMemo(
    () =>
      focused
        ? buildFocusedRows(turn, historyOpen, { input: rawInput, output: rawOutput })
        : buildConversationRows(turn, historyOpen, layout, {
            batchResults: compact && resultStyle !== "rows",
            newInputStyle,
            raw: { input: rawInput, output: rawOutput },
          }),
    [layout, focused, turn, historyOpen, compact, resultStyle, newInputStyle, rawInput, rawOutput]
  );

  const isEmpty = !turn.system && !turn.task && !turn.history && !turn.previous && !turn.input && !turn.output;

  return (
    <div className="flex flex-col size-full">
      {SHOW_VIEW_OPTIONS && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-2 pt-2">
          <OptionSwitcher
            label="Layout"
            storageKey={LAYOUT_KEY}
            options={TURN_LAYOUTS}
            value={layout}
            onChange={setLayout}
          />
          {focused && (
            <OptionSwitcher
              label="Messages"
              storageKey={MESSAGE_STYLE_KEY}
              options={MESSAGE_STYLES}
              value={messageStyle}
              onChange={setMessageStyle}
            />
          )}
          {!focused && (
            <OptionSwitcher
              label="New input"
              storageKey={NEW_INPUT_KEY}
              options={NEW_INPUT_STYLES}
              value={newInputStyle}
              onChange={setNewInputStyle}
            />
          )}
          {compact && !focused && (
            <OptionSwitcher
              label="Results"
              storageKey={RESULTS_KEY}
              options={RESULT_STYLES}
              value={resultStyle}
              onChange={setResultStyle}
            />
          )}
        </div>
      )}
      <div className="relative flex-1 min-h-0 pt-2">
        {isEmpty && <div className="p-4 text-sm text-muted-foreground">No messages recorded for this span.</div>}
        {!isEmpty && (
          <ConversationList
            key={layout}
            rows={rows}
            compact={compact}
            formats={formats}
            resultPreviews={resultStyle === "previews"}
            newInputStyle={newInputStyle}
            bare={focused && messageStyle === "flat"}
            presetKey={presetKey}
            onToggleHistory={toggleHistory}
          />
        )}
      </div>
    </div>
  );
};

const SpanTurn = memo(PureSpanTurn);

export default SpanTurn;
