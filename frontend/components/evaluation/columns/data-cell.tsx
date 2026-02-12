import JsonTooltip from "@/components/ui/json-tooltip";

export const DataCell = ({ getValue, column }: { getValue: () => unknown; column: { getSize: () => number } }) => (
  <JsonTooltip data={getValue()} columnSize={column.getSize()} />
);
