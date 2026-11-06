import { parseAsStringLiteral, useQueryState } from "nuqs";
import { useCallback } from "react";
import { shallow } from "zustand/shallow";

import { SPAN_TAB_PARAM } from "@/components/traces/span-view/use-span-view-tab";
import { type BaseTraceViewStore, useTraceViewBaseStore, useUrlState } from "@/components/traces/trace-view/store/base";

export type TraceViewTab = BaseTraceViewStore["tab"];
const TRACE_VIEW_TABS = ["tree", "transcript", "custom"] as const satisfies readonly TraceViewTab[];

// Not `view`: the traces page already uses it for traces/spans/sessions.
export const TRACE_VIEW_PARAM = "traceView";

const traceViewParser = parseAsStringLiteral(TRACE_VIEW_TABS).withOptions({ history: "replace", scroll: false });

/** Removes the view params a closed trace panel leaves behind. */
export const deleteTraceViewParams = (params: URLSearchParams) => {
  params.delete(TRACE_VIEW_PARAM);
  params.delete(SPAN_TAB_PARAM);
};

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

  const setTab = useCallback(
    (tab: TraceViewTab) => {
      setStoreTab(tab);
      if (syncUrl) void setUrlTab(tab);
    },
    [setStoreTab, setUrlTab, syncUrl]
  );

  return [(syncUrl && urlTab) || storeTab, setTab] as const;
};
