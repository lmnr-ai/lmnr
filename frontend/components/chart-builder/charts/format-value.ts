import { formatSecsToHoursMinsSecs } from "@/lib/utils";

type UnitType = "currency" | "duration" | "plain";

const columnUnitMap: Record<string, UnitType> = {
  cost: "currency",
  total_cost: "currency",
  input_cost: "currency",
  output_cost: "currency",
  duration: "duration",
};

const getUnitForColumn = (columnName?: string): UnitType => {
  if (!columnName) return "plain";

  // Direct match
  if (columnUnitMap[columnName]) return columnUnitMap[columnName];

  // Check if column name contains a known suffix
  const lowerName = columnName.toLowerCase();
  if (lowerName.includes("cost")) return "currency";
  if (lowerName.includes("duration")) return "duration";

  return "plain";
};

export type SingleValue = { kind: "number" | "text" | "empty"; text: string };

const COMPACT_FROM = 1_000_000;

const toCompact = (value: number) => value.toLocaleString(undefined, { notation: "compact", maximumFractionDigits: 2 });

/**
 * A value chart's cell, typed by what the query returned: numbers get the column's unit (plain ones
 * past a million go compact), anything else is shown as written. NULL, and the NaN an empty `avg`
 * serializes to, read as empty. `compact` shortens plain and currency numbers of any size, for a
 * card too small to show the full value legibly.
 */
export const formatSingleValue = (value: unknown, columnName?: string, compact = false): SingleValue => {
  if (value === null || value === undefined || value === "") return { kind: "empty", text: "—" };
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return { kind: "empty", text: "—" };
    const unit = getUnitForColumn(columnName);
    if (unit === "currency" && compact) return { kind: "number", text: `$${toCompact(value)}` };
    if (unit === "plain" && (compact || Math.abs(value) >= COMPACT_FROM)) {
      return { kind: "number", text: toCompact(value) };
    }
    return { kind: "number", text: formatMetricValue(value, columnName) };
  }
  if (typeof value === "object") return { kind: "text", text: JSON.stringify(value) };
  return { kind: "text", text: String(value) };
};

export const formatMetricValue = (value: number, columnName?: string): string => {
  const unit = getUnitForColumn(columnName);

  switch (unit) {
    case "currency":
      return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    case "duration":
      return formatSecsToHoursMinsSecs(value);
    case "plain":
    default:
      return value.toLocaleString();
  }
};
