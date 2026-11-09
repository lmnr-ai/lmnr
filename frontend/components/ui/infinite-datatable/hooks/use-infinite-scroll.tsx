"use client";

import { type DependencyList, useCallback, useEffect, useState } from "react";
import { shallow } from "zustand/shallow";
import { useStoreWithEqualityFn } from "zustand/traditional";

import { createLatestRequest } from "@/lib/api/latest-request";

import { useTableConfigStore } from "../model/table-config-store.tsx";
import { useTableStore } from "../model/table-store.tsx";

export interface InfiniteScrollOptions<TData> {
  /** `signal` aborts when a newer load (deps change, refetch) supersedes this one. */
  fetchFn: (pageParam: number, signal: AbortSignal) => Promise<{ items: TData[]; count?: number }>;
  enabled?: boolean;
  deps?: DependencyList;
}

export function useInfiniteScroll<TData>({ fetchFn, enabled = true, deps = [] }: InfiniteScrollOptions<TData>) {
  const store = useTableStore<TData>();
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
  // Without it, page 0 of the old filters can land after the new one and replace it.
  const [request] = useState(createLatestRequest);

  const fetchPage = useCallback(
    async (pageNumber: number, shouldReset: boolean = false) => {
      if (!enabled) return;

      try {
        setIsFetching(true);
        if (shouldReset) {
          setIsLoading(true);
        }

        const response = await request.run((signal) => fetchFn(pageNumber, signal));
        // The load that superseded this one owns the rows and the loading flags.
        if (response.superseded) return;
        const result = response.data;

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
    [enabled, request, setIsFetching, fetchFn, setCurrentPage, setIsLoading, replaceData, appendData, setError]
  );

  const fetchNextPage = useCallback(() => {
    if (!isFetching && hasMore) {
      fetchPage(currentPage + 1, false);
    }
  }, [isFetching, hasMore, currentPage, fetchPage]);

  const refetch = useCallback(() => {
    // Same guard as the deps effect below: fetchPage no-ops when disabled,
    // so resetting first would clear the table without a follow-up load.
    if (!enabled || isViewLoading) return;
    resetInfiniteScroll();
    fetchPage(0, true);
  }, [fetchPage, enabled, isViewLoading, resetInfiniteScroll]);

  const updateData = useCallback((updater: (prevData: TData[]) => TData[]) => {
    setData(updater);
  }, []);

  useEffect(() => {
    if (enabled && !isViewLoading) {
      resetInfiniteScroll();
      fetchPage(0, true);
    } else {
      // Rows for the old deps must not land while the new ones are gated.
      request.cancel();
      setIsFetching(false);
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, isViewLoading, depsString]);

  useEffect(() => request.cancel, [request]);

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
