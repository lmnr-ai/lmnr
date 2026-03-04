"use client";

import { type DependencyList, useCallback, useEffect } from "react";
import { shallow } from "zustand/shallow";
import { useStoreWithEqualityFn } from "zustand/traditional";

import { useDataTableStore } from "../model/datatable-store.tsx";

export interface FetchResult<TData> {
  items: TData[];
  count?: number;
  meta?: { warning?: string };
}

export interface InfiniteScrollOptions<TData> {
  fetchFn: (pageParam: number) => Promise<FetchResult<TData>>;
  enabled?: boolean;
  deps?: DependencyList;
}

export function useInfiniteScroll<TData>({ fetchFn, enabled = true, deps = [] }: InfiniteScrollOptions<TData>) {
  const store = useDataTableStore<TData>();

  const { data, currentPage, isFetching, isLoading, error, hasMore } = useStoreWithEqualityFn(
    store,
    (state) => ({
      data: state.data,
      currentPage: state.currentPage,
      isFetching: state.isFetching,
      isLoading: state.isLoading,
      error: state.error,
      hasMore: state.hasMore,
    }),
    shallow
  );

  const {
    setIsFetching,
    setIsLoading,
    setCurrentPage,
    replaceData,
    appendData,
    setError,
    setData,
    setWarning,
    resetInfiniteScroll,
  } = useStoreWithEqualityFn(
    store,
    (state) => ({
      setIsFetching: state.setIsFetching,
      setIsLoading: state.setIsLoading,
      setCurrentPage: state.setCurrentPage,
      replaceData: state.replaceData,
      appendData: state.appendData,
      setData: state.setData,
      setError: state.setError,
      setWarning: state.setWarning,
      resetInfiniteScroll: state.resetInfiniteScroll,
    }),
    shallow
  );

  const depsString = JSON.stringify(deps);

  const fetchPage = useCallback(
    async (pageNumber: number, shouldReset: boolean = false) => {
      if (!enabled) return;

      try {
        setIsFetching(true);
        if (shouldReset) {
          setIsLoading(true);
        }

        const result = await fetchFn(pageNumber);

        setWarning(result.meta?.warning);

        if (shouldReset) {
          replaceData(result.items, result.count);
        } else {
          appendData(result.items, result.count);
        }
        setCurrentPage(pageNumber);
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Failed to fetch data"));
        setIsFetching(false);
        setIsLoading(false);
      }
    },
    [enabled, setIsFetching, fetchFn, setCurrentPage, setIsLoading, replaceData, appendData, setError, setWarning]
  );

  const fetchNextPage = useCallback(() => {
    if (!isFetching && hasMore) {
      fetchPage(currentPage + 1, false);
    }
  }, [isFetching, hasMore, currentPage, fetchPage]);

  const refetch = useCallback(() => {
    resetInfiniteScroll();
    fetchPage(0, true);
  }, [fetchPage]);

  const updateData = useCallback((updater: (prevData: TData[]) => TData[]) => {
    setData(updater);
  }, []);

  useEffect(() => {
    if (enabled) {
      resetInfiniteScroll();
      fetchPage(0, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, depsString]);

  return {
    data,
    totalFetched: data.length,
    hasMore,
    isFetching,
    isLoading,
    error,
    fetchNextPage,
    refetch,
    updateData,
  };
}
