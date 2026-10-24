"use client";

import { type DependencyList, useCallback, useEffect, useRef } from "react";
import { shallow } from "zustand/shallow";
import { useStoreWithEqualityFn } from "zustand/traditional";

import { useTableConfigStore } from "../model/table-config-store.tsx";
import { useTableStore } from "../model/table-store.tsx";
import { createLatestRequestGate } from "./request-generation";

export interface InfiniteScrollOptions<TData> {
  fetchFn: (pageParam: number) => Promise<{ items: TData[]; count?: number }>;
  enabled?: boolean;
  deps?: DependencyList;
}

export function useInfiniteScroll<TData>({ fetchFn, enabled = true, deps = [] }: InfiniteScrollOptions<TData>) {
  const store = useTableStore<TData>();
  const requestGate = useRef(createLatestRequestGate()).current;
  const queryGeneration = requestGate.getGeneration();
  // Auto-gate on view resolution; no-op for tables without views.
  const isViewLoading = useTableConfigStore((s) => s.isViewLoading);

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
      resetInfiniteScroll: state.resetInfiniteScroll,
    }),
    shallow
  );

  const depsString = JSON.stringify(deps);

  const fetchPage = useCallback(
    async (pageNumber: number, shouldReset: boolean = false) => {
      if (!enabled) return;

      // This synchronous slot closes the window between resetInfiniteScroll()
      // and React's next render. A stale fetchNextPage callback cannot start a
      // pagination request while the replacement page-0 request is active.
      const request = requestGate.beginRequest();
      if (request === null) return;

      try {
        setIsFetching(true);
        if (shouldReset) {
          setIsLoading(true);
        }

        const result = await fetchFn(pageNumber);

        // A refetch or query change may have started after this request. Its
        // result belongs to the old table contents and must not replace or
        // append to the current query.
        if (!requestGate.isCurrent(request)) return;

        if (shouldReset) {
          replaceData(result.items, result.count);
        } else {
          appendData(result.items, result.count);
        }
        setCurrentPage(pageNumber);
        requestGate.finishRequest(request);
      } catch (err) {
        if (!requestGate.isCurrent(request)) return;
        setError(err instanceof Error ? err : new Error("Failed to fetch data"));
        setIsFetching(false);
        setIsLoading(false);
        requestGate.finishRequest(request);
      }
    },
    [enabled, setIsFetching, fetchFn, setCurrentPage, setIsLoading, replaceData, appendData, setError, requestGate]
  );

  const fetchNextPage = useCallback(() => {
    // IntersectionObserver callbacks can outlive the render that created
    // them. Reject a callback from an older query even when the replacement
    // page-0 request has already completed and released the active slot.
    if (!requestGate.isGenerationCurrent(queryGeneration)) return;
    if (!isFetching && hasMore) {
      fetchPage(currentPage + 1, false);
    }
  }, [isFetching, hasMore, currentPage, fetchPage, queryGeneration, requestGate]);

  const refetch = useCallback(() => {
    // Same guard as the deps effect below: fetchPage no-ops when disabled,
    // so resetting first would clear the table without a follow-up load.
    if (!enabled || isViewLoading) return;
    requestGate.invalidate();
    resetInfiniteScroll();
    fetchPage(0, true);
  }, [fetchPage, enabled, isViewLoading, requestGate, resetInfiniteScroll]);

  const updateData = useCallback(
    (updater: (prevData: TData[]) => TData[]) => {
      setData(updater);
    },
    [setData]
  );

  useEffect(() => {
    // Invalidate before resetting so every response from the prior query is
    // ignored, including errors that arrive after the new request succeeds.
    requestGate.invalidate();
    if (enabled && !isViewLoading) {
      resetInfiniteScroll();
      fetchPage(0, true);
    }
    return () => {
      // Query changes, disabling, view transitions, and unmounts all retire
      // outstanding requests. The next effect invocation starts a new
      // generation when loading remains enabled.
      requestGate.invalidate();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, isViewLoading, depsString]);

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
