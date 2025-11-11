"use client";

import { useCallback, useMemo } from "react";
import { useStore } from "zustand";

import { useDataTableStore } from "../model/datatable-store";

type RowSelectionState = Record<string, boolean>;
type Updater<T> = T | ((old: T) => T);

export function useSelection() {
  const store = useDataTableStore();

  const { selectedRows, selectAll } = useStore(store, (state) => ({
    selectedRows: state.selectedRows,
    selectAll: state.selectAll,
  }));

  const rowSelection = useMemo<RowSelectionState>(
    () =>
      Array.from(selectedRows).reduce((acc, id) => {
        acc[id] = true;
        return acc;
      }, {} as RowSelectionState),
    [selectedRows]
  );

  const onRowSelectionChange = useCallback(
    (updater: Updater<RowSelectionState>) => {
      const newSelection = typeof updater === "function" ? updater(rowSelection) : updater;
      const selectedIds = Object.keys(newSelection).filter((id) => newSelection[id]);
      selectAll(selectedIds);
    },
    [rowSelection, selectAll]
  );

  return {
    rowSelection,
    onRowSelectionChange,
  };
}
