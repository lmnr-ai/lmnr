"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { isEmpty, isNil, isObject } from "lodash";
import { useEffect, useMemo } from "react";

import { CopyButton } from "@/components/ui/copy-button";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { useTableConfigStoreApi } from "@/components/ui/infinite-datatable/model/table-config-store";
import { InfiniteDataTableProvider } from "@/components/ui/infinite-datatable/model/table-store";

const MAX_DISPLAY_LENGTH = 100;

const stringifyCellValue = (value: unknown): string => {
  if (isNil(value)) return "NULL";
  if (isObject(value)) {
    try {
      return JSON.stringify(value);
    } catch {
      return "[Object]";
    }
  }
  return String(value);
};

const ResultCell = ({ raw }: { raw: string }) => (
  <div className="group/cell flex items-center w-full min-w-0 gap-1">
    <span className="truncate flex-1 min-w-0">
      {raw.length > MAX_DISPLAY_LENGTH ? `${raw.slice(0, MAX_DISPLAY_LENGTH)}...` : raw}
    </span>
    <CopyButton
      className="h-5 w-5 shrink-0 opacity-0 group-hover/cell:opacity-100 focus-visible:opacity-100"
      iconClassName="h-3 w-3"
      size="icon"
      variant="ghost"
      text={raw}
    />
  </div>
);

const loadStoredSizing = (storageKey: string): Record<string, number> => {
  try {
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

/**
 * Applies previously-saved column widths on mount and writes resizes back to
 * localStorage. The provider (and its config store) remounts on every query
 * run — this is what carries widths across re-runs of the same template.
 * Stored widths for columns absent from the current result set are kept, so
 * re-running with a different filter/column subset doesn't drop them.
 */
const ColumnSizingPersistence = ({ storageKey }: { storageKey: string }) => {
  const store = useTableConfigStoreApi();

  useEffect(() => {
    const stored = loadStoredSizing(storageKey);
    if (!isEmpty(stored)) {
      store.getState().setColumnSizing({ ...stored, ...store.getState().config.columnSizing });
    }
    return store.subscribe((state, prev) => {
      if (state.config.columnSizing === prev.config.columnSizing) return;
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({ ...loadStoredSizing(storageKey), ...state.config.columnSizing })
        );
      } catch {
        // Quota/serialization failures only lose width persistence.
      }
    });
  }, [store, storageKey]);

  return null;
};

interface ResultsTableProps {
  results: Record<string, any>[];
  /** Scopes persisted column widths, e.g. per (project, template). */
  storageKey: string;
}

export default function ResultsTable({ results, storageKey }: ResultsTableProps) {
  const columns = useMemo<ColumnDef<any>[]>(() => {
    if (isEmpty(results)) return [];
    return Object.keys(results[0]).map((column) => ({
      id: column,
      header: column,
      accessorFn: (row: any) => stringifyCellValue(row[column]),
      cell: ({ getValue }) => <ResultCell raw={getValue<string>()} />,
    }));
  }, [results]);

  return (
    // Keyed by storageKey: switching templates without a route remount would
    // otherwise keep the previous template's config store alive, and its
    // in-memory widths would leak into the new template's localStorage entry
    // via the mount-time merge in ColumnSizingPersistence.
    <InfiniteDataTableProvider key={storageKey}>
      <ColumnSizingPersistence storageKey={storageKey} />
      <InfiniteDataTable
        className="w-full"
        columns={columns}
        data={results}
        hasMore={false}
        isFetching={false}
        isLoading={false}
        fetchNextPage={() => {}}
      />
    </InfiniteDataTableProvider>
  );
}
