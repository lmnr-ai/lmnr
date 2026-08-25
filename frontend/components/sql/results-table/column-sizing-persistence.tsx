"use client";

import { isEqual } from "lodash";
import { useEffect, useState } from "react";

import { type TableConfig, useColumnConfig } from "@/components/ui/infinite-datatable/model/table-config-store";

/**
 * Writes columnSizing changes back to localStorage. Same shape as chart-builder's
 * ColumnConfigEmitter — lives under the provider so the model layer stays a
 * pure state container. Only current-result columns are persisted (prunes stale
 * keys left by prior query shapes on the same storageKey).
 */
export const ColumnSizingPersistence = ({ storageKey, initial }: { storageKey: string; initial: TableConfig }) => {
  const config = useColumnConfig();
  const [seed] = useState(() => initial);

  useEffect(() => {
    if (isEqual(config.columnSizing, seed.columnSizing)) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(config.columnSizing));
    } catch {
      // Quota/serialization failures only lose width persistence.
    }
  }, [config.columnSizing, seed.columnSizing, storageKey]);

  return null;
};
