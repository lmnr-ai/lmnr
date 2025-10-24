"use client";

import { DependencyList, useCallback, useEffect } from "react";
import { useStore } from "zustand";

import { useDataTableStore } from "../datatable-store";

export interface InfiniteScrollOptions<TData> {
  fetchFn: (pageParam: number) => Promise<{ items: TData[]; count: number }>;
  enabled?: boolean;
  deps?: DependencyList;
}

export function useInfiniteScroll<TData>({ fetchFn, enabled = true, deps = [] }: InfiniteScrollOptions<TData>) {
  const store = useDataTableStore<TData>();

  const { data, totalCount, currentPage, isFetching, isLoading, error } = useStore(store, (state) => ({
    data: state.data,
    totalCount: state.totalCount,
    currentPage: state.currentPage,
    isFetching: state.isFetching,
    isLoading: state.isLoading,
    error: state.error,
  }));

  const depsString = JSON.stringify(deps);
  const hasMore = data.length < totalCount;

  const fetchPage = useCallback(
    async (pageNumber: number, shouldReset: boolean = false) => {
      if (!enabled) return;

      try {
        store.getState().setIsFetching(true);
        if (shouldReset) {
          store.getState().setIsLoading(true);
        }

        const result = await fetchFn(pageNumber);

        if (shouldReset) {
          store.getState().replaceData(result.items, result.count);
        } else {
          store.getState().appendData(result.items, result.count);
        }

        store.getState().setCurrentPage(pageNumber);
      } catch (err) {
        store.getState().setError(err instanceof Error ? err : new Error("Failed to fetch data"));
        store.getState().setIsFetching(false);
        store.getState().setIsLoading(false);
      }
    },
    [fetchFn, enabled, store]
  );

  const fetchNextPage = useCallback(() => {
    if (!isFetching && hasMore) {
      fetchPage(currentPage + 1, false);
    }
  }, [isFetching, hasMore, currentPage, fetchPage]);

  const refetch = useCallback(() => {
    store.getState().resetInfiniteScroll();
    fetchPage(0, true);
  }, [fetchPage, store]);

  const updateData = useCallback(
    (updater: (prevData: TData[]) => TData[]) => {
      store.getState().setData(updater);
    },
    [store]
  );

  const setTotalCount = useCallback(
    (countOrUpdater: number | ((prev: number) => number)) => {
      if (typeof countOrUpdater === "function") {
        const currentCount = store.getState().totalCount;
        store.getState().setTotalCount(countOrUpdater(currentCount));
      } else {
        store.getState().setTotalCount(countOrUpdater);
      }
    },
    [store]
  );

  useEffect(() => {
    if (enabled) {
      store.getState().resetInfiniteScroll();
      fetchPage(0, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, depsString]);

  return {
    data,
    totalCount,
    totalFetched: data.length,
    hasMore,
    isFetching,
    isLoading,
    error,
    fetchNextPage,
    refetch,
    updateData,
    setTotalCount,
  };
}
