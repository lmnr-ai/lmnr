import { type TableConfig } from "../model/table-config-store";

// Strip ids the table renders out-of-band (selection checkbox, etc.) and any
// `__`-prefixed reserved id. These never belong in a persisted view config.
function isSystemColumnId(id: string): boolean {
  return id.startsWith("__");
}

// Normalize for the wire. `columnVisibility[id] = true` is the default — drop
// it. Empty maps/arrays are noise — drop them. System column ids never persist.
export function normalizeViewConfig(config: TableConfig): Partial<TableConfig> {
  const out: Partial<TableConfig> = {};

  const columnOrder = config.columnOrder.filter((id) => !isSystemColumnId(id));
  if (columnOrder.length > 0) out.columnOrder = columnOrder;

  const columnVisibility = Object.fromEntries(
    Object.entries(config.columnVisibility).filter(([id, v]) => !isSystemColumnId(id) && v === false)
  );
  if (Object.keys(columnVisibility).length > 0) out.columnVisibility = columnVisibility;

  const columnSizing = Object.fromEntries(Object.entries(config.columnSizing).filter(([id]) => !isSystemColumnId(id)));
  if (Object.keys(columnSizing).length > 0) out.columnSizing = columnSizing;

  if (config.customColumns.length > 0) out.customColumns = config.customColumns;

  return out;
}
