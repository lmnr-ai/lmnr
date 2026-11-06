import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

import { SPAN_TAB_PARAM, type SpanViewTab } from "@/components/traces/span-view/use-span-view-tab";
import { TRACE_VIEW_PARAM } from "@/components/traces/trace-view/use-trace-view-tab";

/** What a trace panel can do to the URL. Hosts' own params (trialId, eventId, view…) go through `edit`. */
export type TracePanelAction =
  | { type: "open"; traceId: string; spanId?: string }
  | { type: "selectSpan"; spanId: string; spanTab?: SpanViewTab }
  | { type: "closeSpan" }
  | { type: "close" };

/**
 * The query string after `action`. Opening keeps the trace view and span tab so stepping between traces stays on
 * them; closing drops every panel param. Pure: `params` is not modified.
 */
export const applyTracePanelAction = (params: URLSearchParams, action: TracePanelAction): URLSearchParams => {
  const next = new URLSearchParams(params);
  switch (action.type) {
    case "open":
      next.set("traceId", action.traceId);
      if (action.spanId) next.set("spanId", action.spanId);
      else next.delete("spanId");
      break;
    case "selectSpan":
      next.set("spanId", action.spanId);
      if (action.spanTab) next.set(SPAN_TAB_PARAM, action.spanTab);
      break;
    case "closeSpan":
      next.delete("spanId");
      next.delete(SPAN_TAB_PARAM);
      break;
    case "close":
      for (const key of ["traceId", "spanId", TRACE_VIEW_PARAM, SPAN_TAB_PARAM]) next.delete(key);
      break;
  }
  return next;
};

/** Opening and closing are history entries; moving within the open trace is not. */
export const tracePanelHistory = (action: TracePanelAction): "push" | "replace" =>
  action.type === "open" || action.type === "close" ? "push" : "replace";

const toHref = (pathname: string, params: URLSearchParams) => {
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
};

/** The link to one message of a span: the panel's URL with that span selected and the message's hash. */
export const messageLinkUrl = (href: string, spanId: string, hash: string): URL => {
  const url = new URL(href);
  url.search = applyTracePanelAction(url.searchParams, { type: "selectSpan", spanId }).toString();
  url.hash = hash;
  return url;
};

/**
 * Applies trace panel actions to the URL. The href is rebuilt without the hash: a `#output-N` message link points
 * into one span, so it must not survive any panel action (nuqs would keep it).
 */
export const useTracePanelNavigate = () => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return useCallback(
    (action: TracePanelAction, edit?: (params: URLSearchParams) => void) => {
      const params = applyTracePanelAction(searchParams, action);
      edit?.(params);
      const unchanged = params.toString() === searchParams.toString() && !window.location.hash;
      if (unchanged) return;
      router[tracePanelHistory(action)](toHref(pathname, params));
    },
    [router, pathname, searchParams]
  );
};
