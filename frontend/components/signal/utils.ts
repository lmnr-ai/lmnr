import { type NavigationConfig } from "@/components/traces/trace-view/navigation-context";

export type EventNavigationItem = {
  traceId: string;
};

export const getEventsConfig = (): NavigationConfig<EventNavigationItem> => ({
  getItemId: (item) => item.traceId,
  updateSearchParams: (item, params) => {
    params.set("traceId", item.traceId);
  },
  getCurrentItem: (list, searchParams) => {
    const traceId = searchParams.get("traceId");
    if (!traceId) return null;

    return list.find((item) => item.traceId === traceId) || null;
  },
});
