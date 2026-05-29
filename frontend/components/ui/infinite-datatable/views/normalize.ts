import { type TableConfig } from "../model/table-config-store";
import { type ViewParams } from "./params";
import { type ViewConfig } from "./types";

// Strip ids the table renders out-of-band (selection checkbox, etc.) and any
// `__`-prefixed reserved id. These never belong in a persisted view config.
function isSystemColumnId(id: string): boolean {
  return id.startsWith("__");
}

// Normalize for the wire. `columnVisibility[id] = true` is the default — drop
// it. Empty maps/arrays/strings are noise — drop them. System column ids
// never persist. View params (filters/search/sort) are appended only when
// non-empty so the stored JSONB stays compact.
export function normalizeViewConfig(config: TableConfig, params: ViewParams): ViewConfig {
  const out: ViewConfig = {};

  const columnOrder = config.columnOrder.filter((id) => !isSystemColumnId(id));
  if (columnOrder.length > 0) out.columnOrder = columnOrder;

  const columnVisibility = Object.fromEntries(
    Object.entries(config.columnVisibility).filter(([id, v]) => !isSystemColumnId(id) && v === false)
  );
  if (Object.keys(columnVisibility).length > 0) out.columnVisibility = columnVisibility;

  const columnSizing = Object.fromEntries(Object.entries(config.columnSizing).filter(([id]) => !isSystemColumnId(id)));
  if (Object.keys(columnSizing).length > 0) out.columnSizing = columnSizing;

  if (config.customColumns.length > 0) out.customColumns = config.customColumns;

  if (params.filters.length > 0) out.filters = params.filters;
  if (params.search) out.search = params.search;
  if (params.sortBy) out.sortBy = params.sortBy;
  if (params.sortDirection) out.sortDirection = params.sortDirection;

  return out;
}
