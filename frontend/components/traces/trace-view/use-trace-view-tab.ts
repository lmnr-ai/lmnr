import { parseAsStringLiteral, useQueryState } from "nuqs";
import { useCallback, useState } from "react";
import { shallow } from "zustand/shallow";

import { type BaseTraceViewStore, useTraceViewBaseStore, useUrlState } from "@/components/traces/trace-view/store/base";

export type TraceViewTab = BaseTraceViewStore["tab"];
const TRACE_VIEW_TABS = ["tree", "transcript", "custom"] as const satisfies readonly TraceViewTab[];

// Not `view`: the traces page already uses it for traces/spans/sessions.
export const TRACE_VIEW_PARAM = "traceView";

const traceViewParser = parseAsStringLiteral(TRACE_VIEW_TABS).withOptions({ history: "replace", scroll: false });

/**
 * Tree / Transcript / Custom. `?traceView` wins over the remembered (persisted) choice, so links open the view they
 * were copied from; picking a view writes both.
 */
export const useTraceViewTab = () => {
  const syncUrl = useUrlState();
  const { storeTab, setStoreTab } = useTraceViewBaseStore(
    (state) => ({ storeTab: state.tab, setStoreTab: state.setTab }),
    shallow
  );
  const [urlTab, setUrlTab] = useQueryState(TRACE_VIEW_PARAM, traceViewParser);
  // Closing drops `?traceView` while the panel is still sliding out; keep the last view so it doesn't flip mid-exit.
  const [lastUrlTab, setLastUrlTab] = useState(urlTab);
  if (urlTab && urlTab !== lastUrlTab) setLastUrlTab(urlTab);

  const setTab = useCallback(
    (tab: TraceViewTab) => {
      setStoreTab(tab);
      if (syncUrl) void setUrlTab(tab);
    },
    [setStoreTab, setUrlTab, syncUrl]
  );

  return [(syncUrl && (urlTab ?? lastUrlTab)) || storeTab, setTab] as const;
};
