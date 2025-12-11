import { NavigationConfig } from "@/components/traces/trace-view/navigation-context";

export type EventNavigationItem = {
  traceId: string;
  spanId: string;
};

export const getEventsConfig = (): NavigationConfig<EventNavigationItem> => ({
  getItemId: (item) => `${item.traceId}-${item.spanId}`,
  updateSearchParams: (item, params) => {
    params.set("traceId", item.traceId);
    params.set("spanId", item.spanId);
  },
  getCurrentItem: (list, searchParams) => {
    const traceId = searchParams.get("traceId");
    const spanId = searchParams.get("spanId");
    if (!traceId || !spanId) return null;

    return list.find((item) => item.traceId === traceId && item.spanId === spanId) || null;
  },
});
