import { parseAsStringLiteral, useQueryState } from "nuqs";
import { useCallback, useState } from "react";

/** `content` is the Messages view for LLM spans and stacked input/output for the rest. */
export const SPAN_VIEW_TABS = ["content", "attributes", "events"] as const;
export type SpanViewTab = (typeof SPAN_VIEW_TABS)[number];

// Not `tab`: host pages (signals) already own that param.
export const SPAN_TAB_PARAM = "spanTab";

const spanTabParser = parseAsStringLiteral(SPAN_VIEW_TABS).withOptions({ history: "replace", scroll: false });

/**
 * The open span tab, kept in `?spanTab` so it deep-links and stays put while stepping through spans.
 * `syncUrl: false` keeps it local, for embeds that must leave the host URL alone.
 */
export const useSpanViewTab = ({
  syncUrl,
  fallback,
  hasEvents,
}: {
  syncUrl: boolean;
  /** Used until a tab is picked, e.g. the tab holding a search snippet. */
  fallback?: SpanViewTab;
  hasEvents: boolean;
}) => {
  const [urlTab, setUrlTab] = useQueryState(SPAN_TAB_PARAM, spanTabParser);
  const [localTab, setLocalTab] = useState<SpanViewTab | null>(null);

  const requested = (syncUrl ? urlTab : localTab) ?? fallback ?? "content";
  const tab = requested === "events" && !hasEvents ? "content" : requested;

  const setTab = useCallback(
    (next: SpanViewTab) => (syncUrl ? void setUrlTab(next) : setLocalTab(next)),
    [setUrlTab, syncUrl]
  );

  return [tab, setTab] as const;
};
