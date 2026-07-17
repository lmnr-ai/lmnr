"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { isEmpty, isEqual, isNil, isObject } from "lodash";
import { useEffect, useMemo, useState } from "react";

import { CopyButton } from "@/components/ui/copy-button";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { type TableConfig, useColumnConfig } from "@/components/ui/infinite-datatable/model/table-config-store";
import { InfiniteDataTableProvider } from "@/components/ui/infinite-datatable/model/table-store";

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
    <span className="truncate flex-1 min-w-0">{raw}</span>
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
 * Writes columnSizing changes back to localStorage. Same shape as chart-builder's
 * ColumnConfigEmitter — lives under the provider so the model layer stays a
 * pure state container. Stored widths for columns absent from the current
 * result set are kept (merge on write).
 */
const ColumnSizingPersistence = ({ storageKey, initial }: { storageKey: string; initial: TableConfig }) => {
  const config = useColumnConfig();
  const [seed] = useState(() => initial);

  useEffect(() => {
    if (isEqual(config.columnSizing, seed.columnSizing)) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ ...loadStoredSizing(storageKey), ...config.columnSizing }));
    } catch {
      // Quota/serialization failures only lose width persistence.
    }
  }, [config.columnSizing, seed.columnSizing, storageKey]);

  return null;
};

interface ResultsTableProps {
  results: Record<string, any>[];
  /** Scopes persisted column widths, e.g. per (project, template). */
  storageKey: string;
}

export default function ResultsTable({ results, storageKey }: ResultsTableProps) {
  const columnIds = useMemo(() => (isEmpty(results) ? [] : Object.keys(results[0])), [results]);

  // Seed at provider creation (same pattern as table-chart). The provider
  // remounts after every query run (loading unmounts this tree), so persistence
  // is what carries widths across re-runs of the same template.
  const defaults = useMemo((): TableConfig => {
    const stored = loadStoredSizing(storageKey);
    return {
      customColumns: [],
      columnOrder: columnIds,
      columnVisibility: {},
      columnSizing: Object.fromEntries(columnIds.filter((id) => id in stored).map((id) => [id, stored[id]])),
    };
  }, [columnIds, storageKey]);

  const columns = useMemo<ColumnDef<any>[]>(
    () =>
      columnIds.map((column) => ({
        id: column,
        header: column,
        accessorFn: (row: any) => stringifyCellValue(row[column]),
        cell: ({ getValue }) => <ResultCell raw={getValue<string>()} />,
      })),
    [columnIds]
  );

  return (
    // Keyed by storageKey: switching templates without a route remount would
    // otherwise keep the previous template's config store alive, and its
    // in-memory widths would leak into the new template's localStorage entry
    // via the write-time merge in ColumnSizingPersistence.
    <InfiniteDataTableProvider key={storageKey} defaults={defaults}>
      <ColumnSizingPersistence storageKey={storageKey} initial={defaults} />
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
