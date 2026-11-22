import { parseAsStringLiteral, useQueryState } from "nuqs";
import { useCallback, useState } from "react";

import { useUrlState } from "@/components/traces/trace-view/store/base";

/** `content` is the Messages view for LLM spans and stacked input/output for the rest. */
const SPAN_VIEW_TABS = ["content", "attributes", "events"] as const;
export type SpanViewTab = (typeof SPAN_VIEW_TABS)[number];

// Not `tab`: host pages (signals) already own that param.
export const SPAN_TAB_PARAM = "spanTab";

export const spanTabParser = parseAsStringLiteral(SPAN_VIEW_TABS).withOptions({ history: "replace", scroll: false });

/**
 * The open span tab, kept in `?spanTab` so it deep-links and stays put while stepping through spans.
 * Kept local where the page has no URL state (`urlState` on the trace-view store).
 */
export const useSpanViewTab = ({
  fallback,
  hasEvents,
}: {
  /** Used until a tab is picked, e.g. the tab holding a search snippet. */
  fallback?: SpanViewTab;
  hasEvents: boolean;
}) => {
  const syncUrl = useUrlState();
  const [urlTab, setUrlTab] = useQueryState(SPAN_TAB_PARAM, spanTabParser);
  const [localTab, setLocalTab] = useState<SpanViewTab | null>(null);
  // Closing drops `?spanTab` while the panel is still sliding out; keep the last tab so it doesn't flip mid-exit.
  const [lastUrlTab, setLastUrlTab] = useState(urlTab);
  if (urlTab && urlTab !== lastUrlTab) setLastUrlTab(urlTab);

  const requested = (syncUrl ? (urlTab ?? lastUrlTab) : localTab) ?? fallback ?? "content";
  const tab = requested === "events" && !hasEvents ? "content" : requested;

  const setTab = useCallback(
    (next: SpanViewTab) => (syncUrl ? void setUrlTab(next) : setLocalTab(next)),
    [setUrlTab, syncUrl]
  );

  return [tab, setTab] as const;
};
