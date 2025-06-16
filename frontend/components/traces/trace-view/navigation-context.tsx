import { debounce } from "lodash";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, PropsWithChildren, useCallback, useContext, useMemo, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";

type NavigationConfig<T> = {
  getItemId: (item: T) => string;
  updateSearchParams: (item: T, params: URLSearchParams) => void;
  getCurrentItem: (list: T[], searchParams: URLSearchParams) => T | null;
};

type TraceViewNavigationContextType<T> = {
  navigateUp: () => void;
  navigateDown: () => void;
  setNavigationRefList: (list: T[]) => void;
};

const TraceViewNavigationContext = createContext<TraceViewNavigationContextType<any>>({
  navigateDown: () => {},
  navigateUp: () => {},
  setNavigationRefList: () => {},
});

export const useTraceViewNavigation = <T,>() =>
  useContext(TraceViewNavigationContext) as TraceViewNavigationContextType<T>;

const TraceViewNavigationProvider = <T,>({
  onNavigate,
  config,
  children,
}: PropsWithChildren<{
  onNavigate?: (item: T | null) => void;
  config: NavigationConfig<T>;
}>) => {
  const router = useRouter();
  const pathName = usePathname();
  const searchParams = useSearchParams();

  const [refList, setRefList] = useState<T[]>([]);
  const currentItemRef = useRef<T | null>(null);

  const currentItem = config.getCurrentItem(refList, searchParams);

  useMemo(() => {
    currentItemRef.current = currentItem;
  }, [currentItem]);

  const setNavigationRefList = useCallback(
    (list: T[]) => {
      setRefList([...list]);
    },
    [setRefList]
  );

  const debouncedRouterPush = useMemo(
    () =>
      debounce((targetItem: T) => {
        const currentSearchParams = new URLSearchParams(window.location.search);
        config.updateSearchParams(targetItem, currentSearchParams);
        router.push(`${pathName}?${currentSearchParams.toString()}`);
      }, 100),
    [config, router, pathName]
  );

  const navigateToItem = useCallback(
    (targetItem: T) => {
      debouncedRouterPush.cancel();

      currentItemRef.current = targetItem;

      if (onNavigate) {
        onNavigate(targetItem);
      }

      debouncedRouterPush(targetItem);
    },
    [debouncedRouterPush, onNavigate]
  );

  const navigateUp = useCallback(() => {
    if (refList.length === 0) return;

    const currentItem = currentItemRef.current;
    if (!currentItem) return;

    const currentId = config.getItemId(currentItem);
    const currentIndex = refList.findIndex((item) => config.getItemId(item) === currentId);
    if (currentIndex <= 0) return;

    const previousItem = refList[currentIndex - 1];
    navigateToItem(previousItem);
  }, [refList, navigateToItem, config]);

  const navigateDown = useCallback(() => {
    if (refList.length === 0) return;

    const currentItem = currentItemRef.current;
    if (!currentItem) return;

    const currentId = config.getItemId(currentItem);
    const currentIndex = refList.findIndex((item) => config.getItemId(item) === currentId);
    if (currentIndex === -1 || currentIndex >= refList.length - 1) return;

    const nextItem = refList[currentIndex + 1];
    navigateToItem(nextItem);
  }, [refList, navigateToItem, config]);

  useHotkeys("ArrowUp, k", navigateUp, {
    preventDefault: true,
  });

  useHotkeys("ArrowDown, j", navigateDown, {
    preventDefault: true,
  });

  const value = useMemo<TraceViewNavigationContextType<T>>(
    () => ({
      navigateUp,
      navigateDown,
      setNavigationRefList,
    }),
    [navigateUp, navigateDown, setNavigationRefList]
  );

  return <TraceViewNavigationContext.Provider value={value}>{children}</TraceViewNavigationContext.Provider>;
};

export default TraceViewNavigationProvider;

export const getTraceConfig = (): NavigationConfig<string> => ({
  getItemId: (traceId) => traceId,
  updateSearchParams: (traceId, params) => {
    params.delete("spanId");
    params.set("traceId", traceId);
  },
  getCurrentItem: (list, searchParams) => {
    const traceId = searchParams.get("traceId");
    return list.find((id) => id === traceId) || null;
  },
});

export const getTraceWithDatapointConfig = (): NavigationConfig<{
  traceId: string;
  datapointId: string;
}> => ({
  getItemId: (item) => item.datapointId,
  updateSearchParams: (item, params) => {
    params.set("traceId", item.traceId);
    params.set("datapointId", item.datapointId);
  },
  getCurrentItem: (list, searchParams) => {
    const traceId = searchParams.get("traceId");
    const datapointId = searchParams.get("datapointId");
    if (!traceId || !datapointId) return null;

    return list.find((item) => item.traceId === traceId && item.datapointId === datapointId) || null;
  },
});
