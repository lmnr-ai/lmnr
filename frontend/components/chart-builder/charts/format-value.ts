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

export const formatMetricValue = (value: number, columnName?: string): string => {
  const unit = getUnitForColumn(columnName);

  switch (unit) {
    case "currency":
      return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    case "duration":
      return `${value.toLocaleString(undefined, { maximumFractionDigits: 3 })}s`;
    case "plain":
    default:
      return value.toLocaleString();
  }
};
